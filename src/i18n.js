/* Pixel Workshop — 中英切换（v1.5）
 * 做法：整份界面文案以「中文原文 → 英文」的字典匹配，运行时替换文本节点和 title/placeholder；
 * 新增的弹窗节点用 MutationObserver 补翻。切回中文时按原文还原，不依赖任何构建步骤。
 */
(function () {
  const EN = {
    /* ---------- 顶栏 / 页签 ---------- */
    "像素工坊": "Pixel Workshop",
    "① 转换": "① Convert",
    "② 编辑": "② Edit",
    "③ 批量": "③ Batch",
    "☰ 菜单": "☰ Menu",
    "打开图片": "Open image",
    "载入示例": "Load sample",
    "载入示例（AI 狐狸）": "Load sample (AI fox)",
    "导出…": "Export…",
    "帮助": "Help",
    "更多": "More",

    /* ---------- 转换页 ---------- */
    "源图": "Source",
    "拖入图片 / 点击打开 / Ctrl+V 粘贴（.pxd.json / .pxw.json 直接进编辑器）":
      "Drop an image / click to open / Ctrl+V to paste (.pxd.json / .pxw.json open in the editor)",
    "尚未载入图片": "No image loaded yet",
    "模板": "Template",
    "— 选择模板 —": "— Select template —",
    "固定模板": "Pin template",
    "保存为模板": "Save as template",
    "固定模板（新图片、批量都只用它）": "Pin template (all new images and batches use only this)",
    "删除": "Delete",
    "导入": "Import",
    "导出": "Export",
    "像素网格": "Pixel grid",
    "自动识别": "Auto detect",
    "固定块大小": "Fixed block size",
    "目标宽度": "Target width",
    "边界吸附（跟随 AI 图的网格漂移）": "Snap to edges (follows grid drift in AI images)",
    "锐化": "Sharpen",
    "模糊大图预设（房子 / 场景）": "Blurry big-image preset (buildings / scenes)",
    "只统一色板（原尺寸，保留全部细节）": "Snap palette only (original size, keep all detail)",
    "取色": "Colour sampling",
    "主色（清晰 AI 像素图）": "Primary colour (sharp AI pixel art)",
    "背景": "Background",
    "自动去除连通背景（不误伤内部同色）": "Remove connected background (keeps same colours inside)",
    "容差": "Tolerance",
    "调色板": "Palette",
    "自动提取": "Auto extract",
    "锁定色板": "Lock palette",
    "— 预设色板 —": "— Preset palette —",
    "导入 .gpl/.pal/.hex": "Import .gpl/.pal/.hex",
    "粘贴色值": "Paste hex",
    "颜色数": "Colours",
    "必保色": "Must-keep colours",
    "吸色": "Colour picker",
    "清除保护": "Clear protection",
    "保护笔": "Protect brush",
    "杂色清理": "Noise cleanup",
    "低于": "Below",
    "块≤": "Block ≤",
    "色差≤": "Colour Δ ≤",
    "杂色热区": "Noise heat map",
    "显示网格": "Show grid",
    "只看结果": "Result only",
    "原图": "Original",
    "结果": "Result",
    "适应": "Fit",
    "放大": "Zoom in",
    "缩小": "Zoom out",
    "颜色体检": "Colour audit",
    "结果色板 · 占比": "Result palette · share",
    "块大小": "Block size",
    "颜色": "Colour",
    "描边": "Outline",
    "描边色": "Outline colour",
    "描边去 L 角（像素完美线）": "Perfect outline corners (pixel-perfect lines)",
    "加 1px 外描边": "Add 1px outer outline",
    "暗度≤": "Darkness ≤",
    "导出倍率": "Export scale",
    "倍率": "Scale",
    "处理中…": "Processing…",
    "像素完美": "Pixel perfect",

    /* ---------- 编辑页 ---------- */
    "铅笔 (B)": "Pencil (B)",
    "橡皮 (E)": "Eraser (E)",
    "抖动笔 (D)": "Dither pen (D)",
    "填充 (G)": "Fill (G)",
    "吸管 (I)": "Eyedropper (I)",
    "直线 (L)": "Line (L)",
    "矩形 (R)": "Rectangle (R)",
    "椭圆 (O)": "Ellipse (O)",
    "抖动渐变 (J)": "Dither gradient (J)",
    "框选 (M)": "Marquee (M)",
    "魔棒选区 (W)": "Magic wand (W)",
    "移动 (V)": "Move (V)",
    "去底魔棒": "Background wand",
    "换色": "Recolour",
    "铅笔": "Pencil",
    "橡皮": "Eraser",
    "抖动笔": "Dither pen",
    "抖动渐变": "Dither gradient",
    "填充": "Fill",
    "吸管": "Eyedropper",
    "直线": "Line",
    "矩形": "Rectangle",
    "椭圆": "Ellipse",
    "框选": "Marquee",
    "魔棒": "Magic wand",
    "移动": "Move",
    "笔刷": "Brush",
    "抖动": "Dither",
    "实心": "Filled",
    "指定": "Specify",
    "有序 4×4": "Ordered 4×4",
    "误差扩散": "Error diffusion",
    "交换 (X)": "Swap (X)",
    "主色": "Primary",
    "副色（右键），X 交换": "Secondary (right click), X to swap",
    "左键主色 · 右键副色 · 双击改色": "Left click: primary · right click: secondary · double-click to edit",
    "撤销 Ctrl+Z": "Undo (Ctrl+Z)",
    "重做 Ctrl+Y": "Redo (Ctrl+Y)",
    "全选": "Select all",
    "图层": "Layers",
    "不透明度": "Opacity",
    "向下合并": "Merge down",
    "复制": "Duplicate",
    "动画帧": "Frames",
    "洋葱皮": "Onion skin",
    "本帧时长": "Frame duration",
    "＋复制帧": "+ Duplicate frame",
    "▶ 播放": "▶ Play",
    "水平翻转": "Flip horizontal",
    "垂直翻转": "Flip vertical",
    "左右对称": "Mirror X",
    "上下对称": "Mirror Y",
    "平铺": "Tile",
    "中心点": "Centre",
    "偏移": "Offset",
    "输出": "Output",

    /* ---------- 批量页 ---------- */
    "批量转换": "Batch convert",
    "添加图片": "Add images",
    "清空": "Clear",
    "开始并打包 ZIP": "Start and pack ZIP",
    "待处理": "Pending",
    "完成": "Done",
    "共": "Total",

    /* ---------- 菜单 / 关于 / 立绘 ---------- */
    "召唤师原型 · 队伍立绘": "Summoner prototype · party portraits",
    "点击立绘切换表情 · Esc 关闭": "Click a portrait to cycle expressions · Esc to close",
    "关于": "About",
    "关闭": "Close",
    "取消": "Cancel",
    "确定": "OK",
    "知道了": "Got it",
    "应用": "Apply",
    "保存": "Save",
    "新建": "New",
    "新建画布": "New canvas",
    "画布大小": "Canvas size",
    "打开项目 / PXD": "Open project / PXD",
    "删除模板": "Delete template",
    "固定": "Pin",
    "图层 1": "Layer 1",
    "部位": "Parts",
    "待处理 0": "Pending 0",

    /* ---------- 导出对话框 ---------- */
    "PNG · 当前帧": "PNG · current frame",
    "原图尺寸 PNG · 当前帧": "Original-size PNG · current frame",
    "精灵表 PNG": "Sprite sheet PNG",
    "GIF 动画": "GIF animation",
    "逐帧 PNG（ZIP）": "Per-frame PNG (ZIP)",
    "像素数据 .pxd.json": "Pixel data .pxd.json",
    "保存项目 .json": "Save project .json",
    "色板 .gpl": "Palette .gpl",
    "色板 .hex": "Palette .hex",
    "色板 PNG": "Palette PNG",
    "每色一格": "One cell per colour",
    "每帧一张": "One PNG per frame",
    "编辑器最大 1024×1024": "Editor limit 1024×1024",
    "图片为空": "The image is empty",
    "剪贴板": "Clipboard",
    "剪贴板图片.png": "clipboard.png",
    "示例_AI狐狸.webp": "sample_ai_fox.webp",
    "像素工坊_模板.json": "pixel-workshop_templates.json",
    "副本": "Copy",
    "已复制": "Copied",
    "已剪切": "Cut",
    "已删除": "Deleted",
    "提取": "Extract"
  };
  window.PW_I18N_EN = EN;

  /* 补充词条：界面里由脚本拼出来、或带数量后缀的短句 */
  Object.assign(EN, {
    "添加": "Add",
    "导出 PNG": "Export PNG",
    "1格": "1 cell",
    "2格": "2 cells",
    "4格": "4 cells",
    "处理步骤": "Steps",
    "网格": "Grid",
    "色板": "Swatches",
    "＋主色": "+ Primary colour",
    "上移": "Move up",
    "下移": "Move down",
    "主色（左键）": "Primary (left click)",
    "把主色加入色板": "Add primary colour to palette",
    "从画面提取色板": "Extract palette from the image",
    "PICO-8（16 色）": "PICO-8 (16 colours)",
    "Sweetie 16（16 色）": "Sweetie 16 (16 colours)",
    "DawnBringer 16（16 色）": "DawnBringer 16 (16 colours)",
    "Game Boy（4 色）": "Game Boy (4 colours)",
    "像素工坊_批量_": "pixel-workshop_batch_",
    "常规": "Normal",
    "从参考图提取": "Extract from reference",
    "无（推荐）": "None (recommended)",
    "裁掉透明边": "Trim transparent border",
    "送到编辑器 →": "Send to editor →",
    "所有帧和图层": "All frames and layers",
    "吸附到色板": "Snap to palette",
    "选区与画布": "Selection & canvas",
    "选区→新图层": "Selection → new layer",
    "裁剪到选区": "Crop to selection",
    "画布大小…": "Canvas size…",
    "添加文件夹": "Add folder",
    "像素工坊 · 使用说明": "Pixel Workshop · Help",
    "房子、场景等被缩放过、边缘发糊的 AI 图":
      "AI images of buildings, scenes etc. that were rescaled and have soft edges",
    "去底魔棒 (K)：点背景，连通区域变透明": "Background wand (K): click the background, the connected area becomes transparent",
    "换色 (C)：点一个颜色，整层同色换成主色": "Recolour (C): click a colour, every matching pixel on the layer takes the primary colour",
    "把当前图层吸附到色板颜色": "Snap the current layer to palette colours",
    "选区 ${b.w}×${b.h}": "Selection ${b.w}×${b.h}",
    "导出当前结果": "Export current result",
    "▸ 召唤师原型（彩蛋）": "▸ Summoner prototype (hidden)",
    "细线保护（模糊大图推荐）": "Thin-line protection (recommended for blurry images)",
    "平均（会混色）": "Average (blends colours)",
    "取真实色（不取平均，颜色不发灰）": "Take real colours (no averaging, no grey cast)",
    "小面积色保留": "Keep small-area colours",
    "打开上方「吸色」后点原图加入，点色块移除": "Turn on the eyedropper above, click the source to add, click a swatch to remove",
    "无。徽章、花、灯火这类小面积颜色被挤掉时用。": "None. Use this when small but important colours (badges, flowers, lamps) get squeezed out.",
    "把当前结果色板锁定（批量统一用）": "Lock the current result palette (keeps batches consistent)",
    "色板为空：选预设、导入，或在「自动提取」下点「锁定当前结果色板」。为空时按自动提取处理。":
      "Palette is empty: pick a preset, import one, or use [lock current result palette] under auto-extract. Empty means auto-extract.",
    "点色块删除；参考图可以是你手工调过色的样图，工具只取它的颜色。":
      "Click a swatch to remove it. The reference can be an image you already tuned by hand — only its colours are taken.",
    "合并低占比颜色": "Merge low-share colours",
    "吸收杂色小块（相近色）": "Absorb small speckles (similar colours)",
    "差别很大的单个像素（眼睛高光等）不会被吸收。要保留的细节用结果图上的「保护笔」涂一下。":
      "Single high-contrast pixels (eye highlights etc.) are never absorbed. Paint over details you want to keep with the protect brush.",
    "统一描边色（轮廓上的暗色）": "Unify outline colour (dark colours on edges)",
    "导出为原图尺寸（直接替换原贴图）": "Export at original size (drop-in replacement for the game texture)",
    "全局（不限连通）": "Global (any connectivity)",
    "在「转换」页点「送到编辑器」，或": "Click [Send to editor] on the Convert page, or",
    "改色时联动替换画面中的该色": "Replace that colour everywhere when editing a swatch",
    "对多张图片使用「转换」页的设置。做同一套素材时，先在转换页调好一张并「保存为模板」，再勾选「固定模板」：整批用同一个模板":
      "Apply the Convert page settings to many images. For a consistent asset set, tune one image, [save as template], then tick [pin template] so the whole batch uses it.",
    "没有可导出的内容：先载入图片或打开编辑器": "Nothing to export: load an image or open the editor first",
    "勾选后：导入新图片、批量处理都只用这个模板，不再按图片自动改设置":
      "When ticked: new images and batches use only this template, settings no longer adapt per image",
    "把全部模板存成 .json 文件备份，换电脑或换浏览器时导入":
      "Save all templates to a .json backup; import it on another machine or browser",
    "不重新分块，每个原图像素保留；只把颜色统一到色板。细节全保留，尺寸不变，适合想保留原图观感的场景图":
      "No re-blocking: every source pixel is kept and only colours snap to the palette. Same size, all detail — good for scene art you want to keep looking like the original",
    "越高越照顾面积小但醒目的颜色（花、旗帜、灯），避免被大面积的墙和屋顶挤掉":
      "Higher values protect small but striking colours (flowers, flags, lamps) from being crowded out by large walls and roofs",
    "每个像素块放大回它在原图中的位置：尺寸、位置和原图完全一致，可直接替换游戏贴图":
      "Scale every cell back to its original position: same size and placement as the source, so it can replace the game texture directly",
    "橙框：3×3 范围内颜色≥5 种的位置，适合重点清理或手工重画":
      "Orange boxes: places with 5+ colours in a 3×3 neighbourhood — good candidates for cleanup or manual repaint",
    "在结果图上涂抹：被保护的区域不参与杂色合并": "Paint on the result: protected areas are excluded from speckle merging",
    "还没有模板：调好设置后点「保存为模板」，再勾选「固定模板」。":
      "No templates yet: tune the settings, click [Save as template], then tick [Pin template].",
    "对多张图片使用「转换」页的设置。做同一套素材时，先在转换页调好一张并「保存为模板」，再勾选「固定模板」：整批用同一个模板（网格、取色、色板、清理、导出方式全部一致），不会每张自动改设置。":
      "Apply the Convert page settings to many images. For a consistent asset set, tune one image, [save as template], then tick [pin template]: the whole batch shares the same grid, sampling, palette, cleanup and export settings instead of adapting per image.",
    "点原图（或结果图）上的位置，把原图那里的颜色加入色板：自动模式进「必保色」，锁定模式直接加入色板。适合小面积但重要的颜色（徽章、花、灯火）":
      "Click a spot on the source (or result) to add that colour to the palette: in auto mode it becomes a must-keep colour, in locked mode it is added directly. Best for small but important colours (badges, flowers, lamps)."
  });
})();

/* ---------- 运行时切换引擎（双向词典，切回中文靠反向表） ---------- */
(function () {
  const EN = window.PW_I18N_EN || {};
  const ZH = {};
  Object.keys(EN).forEach((k) => { if (!(EN[k] in ZH)) ZH[EN[k]] = k; });
  window.PW_I18N_ZH = ZH;

  const ATTRS = ['title', 'placeholder', 'aria-label', 'alt'];
  const store = localStorage;
  let lang = store.getItem('pw.lang') === 'en' ? 'en' : 'zh';
  let busy = false;

  const map = () => (lang === 'en' ? EN : ZH);
  const hit = (s) => {
    const k = String(s).trim();
    if (!k) return null;
    const m = map();
    return Object.prototype.hasOwnProperty.call(m, k) ? m[k] : null;
  };
  const swap = (v) => {
    const k = v.trim();
    const r = hit(k);
    return r === null ? null : v.replace(k, r);
  };

  function doText(node) {
    const v = node.nodeValue;
    if (!v || !v.trim()) return;
    const p = node.parentElement;
    if (p && /^(SCRIPT|STYLE|CANVAS|TEXTAREA)$/.test(p.tagName)) return;   // 别动脚本和代码内容
    const want = swap(v);
    if (want !== null && node.nodeValue !== want) node.nodeValue = want;
  }

  function doAttrs(el) {
    if (!el.getAttribute) return;
    for (const a of ATTRS) {
      const v = el.getAttribute(a);
      if (!v || !v.trim()) continue;
      const want = swap(v);
      if (want !== null && el.getAttribute(a) !== want) el.setAttribute(a, want);
    }
  }

  function walk(root) {
    if (!root) return;
    if (root.nodeType === 3) { doText(root); return; }
    if (root.nodeType !== 1) return;
    doAttrs(root);
    const tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
    let n;
    while ((n = tw.nextNode())) doText(n);
    if (root.querySelectorAll) root.querySelectorAll('*').forEach(doAttrs);
  }

  const obs = new MutationObserver((muts) => {
    if (busy || lang !== 'en') return;
    busy = true;
    try {
      for (const m of muts) {
        if (m.type === 'childList') m.addedNodes.forEach(walk);
        else if (m.type === 'characterData') doText(m.target);
      }
    } finally { busy = false; }
  });

  function set(l) {
    const next = l === 'en' ? 'en' : 'zh';
    if (next === lang) return;
    lang = next;
    store.setItem('pw.lang', lang);
    document.documentElement.lang = lang === 'en' ? 'en' : 'zh-CN';
    obs.disconnect();
    busy = true;
    try { walk(document.body); } finally { busy = false; }
    obs.observe(document.body, { childList: true, subtree: true, characterData: true });
    try { document.dispatchEvent(new CustomEvent('pw-lang', { detail: lang })); } catch (e) {}
  }

  window.pwLang = () => lang;
  window.pwSetLang = set;
  if (lang === 'en') {
    const go = () => { lang = 'zh'; set('en'); };   // set() 有同值短路，先归零再切
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go);
    else go();
  }
})();
