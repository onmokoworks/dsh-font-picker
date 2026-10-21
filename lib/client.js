window.__ModuleLoader__.load({ id: "dsh-font-picker", factory: require => {
  const React = require("react");
  const h = React.createElement;
  const roles = [
    { key: "textFontFamily", label: "本文・画面のフォント", hint: "会話本文とアプリの表示に使います。" },
    { key: "codeFontFamily", label: "コードのフォント", hint: "コードブロックやツール出力に使います。" },
    { key: "terminalFontFamily", label: "ターミナルのフォント", hint: "サイドバーのターミナルに使います。" },
  ];
  const stylesheet = `
    .dsh-font-picker { color:var(--dsw-alias-label-primary); font-size:14px; line-height:1.5; min-width:0; }
    .dsh-font-picker h2 { font-size:18px; line-height:1.4; margin:0 0 10px; }
    .dsh-font-picker p { margin:0; }
    .dsh-font-picker .fp-muted { color:var(--dsw-alias-label-secondary); }
    .dsh-font-picker .fp-toolbar { display:flex; align-items:center; justify-content:space-between; gap:12px; margin:18px 0 8px; }
    .dsh-font-picker .fp-role { border-top:1px solid var(--dsw-alias-border-l2); padding:18px 0; }
    .dsh-font-picker .fp-row { display:flex; gap:12px; align-items:center; justify-content:space-between; }
    .dsh-font-picker .fp-label { font-weight:600; }
    .dsh-font-picker .fp-hint { font-size:12px; margin-top:3px; }
    .dsh-font-picker button,.dsh-font-picker input,.dsh-font-picker select { font:inherit; color:var(--dsw-alias-label-primary); background:var(--dsw-alias-bg-layer-1); border:1px solid var(--dsw-alias-border-l2); border-radius:8px; }
    .dsh-font-picker button { padding:7px 12px; min-height:34px; cursor:pointer; }
    .dsh-font-picker button:disabled { opacity:.55; cursor:wait; }
    .dsh-font-picker button:focus-visible,.dsh-font-picker input:focus-visible,.dsh-font-picker select:focus-visible { outline:2px solid var(--dsw-alias-brand-primary,#4169e1); outline-offset:2px; }
    .dsh-font-picker .fp-trigger { width:235px; max-width:50%; text-align:left; overflow-wrap:anywhere; }
    .dsh-font-picker .fp-editor { margin-top:14px; }
    .dsh-font-picker .fp-search { display:block; width:100%; box-sizing:border-box; padding:8px 10px; margin:6px 0 10px; }
    .dsh-font-picker .fp-list { display:block; width:100%; height:180px; box-sizing:border-box; border-radius:6px; padding:4px; }
    .dsh-font-picker option { padding:4px 8px; }
    .dsh-font-picker .fp-preview { min-height:60px; padding:12px 0; font-size:18px; line-height:1.7; overflow-wrap:anywhere; }
    .dsh-font-picker .fp-actions { display:flex; gap:8px; align-items:center; flex-wrap:wrap; }
    .dsh-font-picker .fp-error { margin-top:8px; color:var(--dsw-alias-state-error-primary,#b42318); }
    .dsh-font-picker .fp-status { min-height:21px; margin-top:8px; }
    @media(max-width:560px) { .dsh-font-picker .fp-row { align-items:stretch; flex-direction:column; gap:8px; } .dsh-font-picker .fp-trigger { width:100%; max-width:100%; } }
  `;
  function fontCss(name) {
    return name ? `"${name.replace(/["\\<>\u0000-\u001f]/g, "")}"` : "";
  }
  function firstFamily(value) {
    return (value || "").split(",")[0].replace(/^["'\s]+|["'\s]+$/g, "");
  }
  function familyCss(family, fonts) {
    if (!family) return "";
    const font = fonts.find(item => item.family === family);
    return [...new Set([family, ...(font?.aliases || [])])].map(fontCss).join(", ");
  }
  function createFaceLoader(fontSet, Face, request) {
    const cached = new Map();
    const owned = new Set();
    const lifetime = new AbortController();
    let sequence = 0;
    return {
      resolve(family) {
        if (!family) return Promise.resolve("");
        if (!cached.has(family)) {
          const pending = (async () => {
            const response = await request(`/dsh-font-picker/fonts?family=${encodeURIComponent(family)}`, { signal: lifetime.signal });
            const data = await response.json();
            if (!response.ok || !data.localNames?.length) throw new Error(data.error || "書体を読み込めませんでした。");
            const alias = `dsh-selected-face-${++sequence}`;
            const sources = data.localNames.map(name => `local(${fontCss(name)})`).join(", ");
            // A Windows legacy family may contain only a Bold face.
            // Bind that exact face as the chosen base face, so ordinary text
            // does not fall back while headings happen to match Bold.
            const face = await new Face(alias, sources, { weight: "400", style: "normal" }).load();
            if (lifetime.signal.aborted) throw new Error("フォント設定は閉じられました。");
            fontSet.add(face); owned.add(face);
            return fontCss(alias);
          })().catch(error => { cached.delete(family); throw error; });
          cached.set(family, pending);
        }
        return cached.get(family);
      },
      dispose() {
        lifetime.abort();
        for (const face of owned) fontSet.delete(face);
        owned.clear(); cached.clear();
      },
    };
  }
  function bindTextFont(form, root, body, resolveFace) {
    // Locale styles set the root family; theme styles set a separate body
    // family. Keep both scopes aligned so inherited UI text and markdown
    // typography tokens resolve the same user choice.
    const targets = [[root, "--dsw-font-family"], [body, "--dsw-font-family"], [body, "font-family"]];
    const originals = targets.map(([element, property]) => [
      element, property, element.style.getPropertyValue(property), element.style.getPropertyPriority(property),
    ]);
    const restore = () => originals.forEach(([element, property, value, priority]) => {
      if (value) element.style.setProperty(property, value, priority);
      else element.style.removeProperty(property);
    });
    let generation = 0;
    const sync = () => {
      const currentGeneration = ++generation;
      const snapshot = form.getSnapshot();
      if (snapshot.status !== "ready") return;
      const family = (snapshot.value?.textFontFamily || "").split(",")
        .map(name => fontCss(firstFamily(name))).filter(Boolean).join(", ");
      if (!family) { restore(); return; }
      const stack = `${family}, var(--dsh-font-family-text-default, sans-serif)`;
      targets.forEach(([element, property]) => element.style.setProperty(property, stack, "important"));
      if (resolveFace) resolveFace(firstFamily(snapshot.value.textFontFamily)).then(alias => {
        if (generation !== currentGeneration) return;
        targets.forEach(([element, property]) => element.style.setProperty(property, `${alias}, ${stack}`, "important"));
      }).catch(error => console.warn("font-picker: selected face could not load", error.message));
    };
    const unsubscribe = form.subscribe(sync);
    sync();
    return () => { generation++; unsubscribe(); restore(); };
  }
  function createFontWriter(ctx, form) {
    const mirror = ctx.configForms.describe();
    return async (field, value) => {
      const ops = [{ op: "set", path: [field], value }];
      let response = await ctx.remote.settings.mutate("ui-theme", ops, form.getSnapshot().revision);
      // A second settings window may have changed the revision. Re-read and
      // retry only that conflict; preserve all unrelated fields and refusals.
      if (!response.ok && response.error.code === "settings/conflict") {
        await mirror.load();
        response = await ctx.remote.settings.mutate("ui-theme", ops, form.getSnapshot().revision);
      }
      if (!response.ok) {
        await mirror.load();
        throw new Error(`保存できませんでした：${response.error.message}`);
      }
      mirror.acceptView(response.value);
    };
  }
  function Picker({ form, writeFont, resolveFace }) {
    const snapshot = React.useSyncExternalStore(
      React.useCallback(fn => form.subscribe(fn), [form]),
      React.useCallback(() => form.getSnapshot(), [form])
    );
    const [fonts, setFonts] = React.useState([]);
    const [loading, setLoading] = React.useState(true);
    const [loadError, setLoadError] = React.useState("");
    const [refresh, setRefresh] = React.useState(0);
    const [active, setActive] = React.useState(null);
    const [query, setQuery] = React.useState("");
    const [selected, setSelected] = React.useState("");
    const [saving, setSaving] = React.useState(false);
    const [status, setStatus] = React.useState("");
    const [saveError, setSaveError] = React.useState("");
    const [previewFace, setPreviewFace] = React.useState("");
    const triggers = React.useRef({});
    const search = React.useRef(null);
    const mounted = React.useRef(true);
    React.useEffect(() => {
      mounted.current = true;
      return () => { mounted.current = false; };
    }, []);
    React.useEffect(() => {
      const controller = new AbortController();
      setLoading(true);
      setLoadError("");
      fetch("/dsh-font-picker/fonts" + (refresh ? "?refresh=1" : ""), { signal: controller.signal })
        .then(async response => {
          const result = await response.json();
          if (!response.ok || !Array.isArray(result.fonts)) throw new Error(result.error || "フォント一覧を取得できませんでした。");
          return result.fonts;
        })
        .then(items => { if (!controller.signal.aborted) setFonts(items); })
        .catch(error => { if (!controller.signal.aborted) setLoadError(error.message); })
        .finally(() => { if (!controller.signal.aborted) setLoading(false); });
      return () => controller.abort();
    }, [refresh]);
    React.useEffect(() => { if (active) search.current?.focus(); }, [active]);
    React.useEffect(() => {
      let cancelled = false;
      setPreviewFace("");
      if (!active || !selected) return;
      const timer = setTimeout(() => {
        resolveFace(selected).then(face => { if (!cancelled) setPreviewFace(face); })
          .catch(() => {}); // Save reports an actual face-loading failure.
      }, 180);
      return () => { cancelled = true; clearTimeout(timer); };
    }, [active, selected, resolveFace]);
    const normalizedQuery = query.normalize("NFKC").toLocaleLowerCase().trim();
    const filtered = React.useMemo(() => fonts.filter(font =>
      font.aliases.some(alias => alias.normalize("NFKC").toLocaleLowerCase().includes(normalizedQuery))
    ), [fonts, normalizedQuery]);
    function open(role) {
      setSelected(firstFamily(snapshot.value?.[role.key]));
      setQuery(""); setSaveError(""); setStatus(""); setActive(role.key);
    }
    function close() {
      const previous = active;
      setActive(null);
      triggers.current[previous]?.focus();
    }
    async function save(role, family) {
      setSaving(true); setSaveError(""); setStatus("");
      try {
        if (family && role.key === "textFontFamily") await resolveFace(family);
        await writeFont(role.key, familyCss(family, fonts));
        if (mounted.current) {
          setStatus(`${role.label}を${family || "デフォルト"}に変更しました。`);
          close();
        }
      } catch (error) {
        if (mounted.current) setSaveError(error.message || "保存できませんでした。");
      } finally {
        if (mounted.current) setSaving(false);
      }
    }
    return h("section", { className: "dsh-font-picker", "aria-label": "フォント設定" },
      h("h2", null, "フォント"),
      h("p", { className: "fp-muted" }, "PCに入っているフォントを一覧から選べます。選んだ書体はプレビューで確認できます。"),
      h("div", { className: "fp-toolbar" },
        h("span", { role: "status", className: "fp-muted" }, loading ? "PCのフォントを取得中…" : `${fonts.length.toLocaleString()}種類のフォント`),
        h("button", { type: "button", disabled: loading || saving, onClick: () => setRefresh(value => value + 1) }, "一覧を更新")
      ),
      loadError ? h("p", { role: "alert", className: "fp-error" }, loadError) : null,
      roles.map(role => {
        const current = snapshot.value?.[role.key] || "";
        const opened = active === role.key;
        const selectedInList = filtered.some(font => font.family === selected);
        const selectedAvailable = !selected || fonts.some(font => font.family === selected);
        return h("div", { className: "fp-role", key: role.key },
          h("div", { className: "fp-row" },
            h("div", null,
              h("div", { className: "fp-label", id: `fp-label-${role.key}` }, role.label),
              h("p", { className: "fp-hint fp-muted" }, role.hint)
            ),
            h("button", {
              type: "button", className: "fp-trigger",
              ref: element => { triggers.current[role.key] = element; },
              "aria-label": `${role.label}を選ぶ：${firstFamily(current) || "デフォルト"}`,
              "aria-expanded": opened, "aria-controls": `fp-editor-${role.key}`,
              disabled: saving || snapshot.status !== "ready" || !snapshot.writable,
              onClick: () => opened ? close() : open(role),
            }, current ? firstFamily(current) + " ▾" : "デフォルト ▾")
          ),
          opened ? h("div", {
            id: `fp-editor-${role.key}`, className: "fp-editor",
            onKeyDown: event => {
              if (event.key === "Escape" && !saving) { event.stopPropagation(); close(); }
            },
          },
            h("label", { htmlFor: `fp-search-${role.key}` }, "フォントを検索"),
            h("input", {
              id: `fp-search-${role.key}`, ref: search, type: "search",
              className: "fp-search", placeholder: "日本語名・英語名で絞り込み…",
              value: query, autoComplete: "off", spellCheck: false, disabled: saving,
              onChange: event => setQuery(event.target.value),
            }),
            h("select", {
              className: "fp-list", size: 7, "aria-label": `${role.label}の一覧`,
              disabled: loading || saving, value: selected,
              onChange: event => setSelected(event.target.value),
            },
              h("option", { value: "" }, "デフォルト"),
              selected && !selectedInList ? h("option", { value: selected }, `${selected}（現在の候補）`) : null,
              filtered.map(font => h("option", { key: font.family, value: font.family }, font.family))
            ),
            h("p", { className: "fp-hint fp-muted", role: "status" },
              filtered.length ? `${filtered.length.toLocaleString()}件` : "一致するフォントがありません。検索語を変えてください。"),
            h("div", {
              className: "fp-preview", "aria-label": "フォントのプレビュー",
              style: { fontFamily: selected ? `${previewFace ? previewFace + ", " : ""}${familyCss(selected, fonts)}, sans-serif` : "inherit" },
            }, "あいうえお 漢字 ABC abc 0123"),
            h("div", { className: "fp-actions" },
              h("button", { type: "button", disabled: saving || loading || !selectedAvailable, onClick: () => save(role, selected) }, saving ? "保存中…" : "このフォントを使う"),
              h("button", { type: "button", disabled: saving, onClick: close }, "キャンセル")
            ),
            saveError ? h("p", { role: "alert", className: "fp-error" }, saveError) : null
          ) : null
        );
      }),
      h("p", { role: "status", className: "fp-status fp-muted" }, status),
      h("p", { className: "fp-hint fp-muted" }, "一覧はHarnessを動かしているPCのフォントです。別の端末で同じ書体を表示するには、その端末にもフォントが必要です。")
    );
  }
  return {
    name: "dsh-font-picker",
    inject: ["slots", "configForms", "remote", "remote.settings"],
    createFontWriter,
    createFaceLoader,
    bindTextFont,
    familyCss,
    apply(ctx) {
      const form = ctx.configForms.get("ui-theme");
      const writeFont = createFontWriter(ctx, form);
      const faces = createFaceLoader(document.fonts, FontFace, fetch);
      const resolveFace = family => faces.resolve(family);
      ctx.effect(() => () => faces.dispose(), "font-picker: unload local font faces");
      ctx.effect(() => bindTextFont(form, document.documentElement, document.body, resolveFace), "font-picker: synchronize UI and conversation fonts");
      ctx.effect(() => {
        const style = document.createElement("style");
        style.textContent = stylesheet;
        document.head.appendChild(style);
        return () => style.remove();
      }, "font-picker: styles");
      ctx.slots.inject("settings.section", () => ctx.slots.register({
        name: "settings.section", id: "local-font-picker", order: 61,
        label: () => "フォント",
      }, () => h(Picker, { form, writeFont, resolveFace })));
    },
  };
} });
