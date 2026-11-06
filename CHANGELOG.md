# Changelog

All notable changes to Pixel Workshop. 版本历史（中英对照）.

## v1.4.0 — 2026-11-06

**Menu + summoner prototype portraits · 菜单与召唤师原型立绘**

- 新增顶栏 `☰ 菜单`：载入示例、召唤师原型 · 队伍立绘、导出当前结果、关于。
  Added a `☰ Menu` in the top bar: load sample, summoner-prototype portraits, export, about.
- 立绘面板：4 个角色 × 表情，点击循环切换，`Esc` / 点空白关闭；19 张立绘 + 1 张彩蛋全部内联（约 290KB），单文件仍然离线可用。
  Portrait panel: 4 characters × expressions, click to cycle, close with `Esc` or a click outside; all 19 portraits + 1 easter-egg image are inlined (~290KB) so the single file stays offline.
- 彩蛋：「关于」连点三下 → 菜单底部出现隐藏项；立绘面板对「猎手」连点三下 → `alert` + 一行小字。
  Easter egg: click About three times to reveal a hidden menu entry; click the Ranger portrait three times in the panel for an `alert` expression and a small caption.
- 中英日三语 README（`README.md` / `README.zh-CN.md` / `README.ja.md`），其余语言欢迎 PR。
  READMEs in English / Chinese / Japanese; other languages welcome via PR.
- 示例 `examples/feng_warrior/` 换成新立绘（正面 128×258、背面 122×259，由本工具转换），`feng_anim.py` 部位坐标按新比例重调；侧身源图未提供，左右两方向暂缺。
  The `examples/feng_warrior/` art now uses the new design (front 128×258, back 122×259, converted by this tool); part coordinates in `feng_anim.py` were re-tuned. Side-view source art is not available yet, so left/right are not generated.

## v1.3 — 2026-10-02

- 新增纯文本像素数据格式 `.pxd.json`（色板 + 每像素一字符 + 图层/帧/meta）。
  New plain-text pixel format `.pxd.json` (palette + one char per pixel + layers/frames/meta).
- 新增命令行 `cli/pw.js`（convert / topxd / render / info / frompxw）与 Python 动画库 `cli/pxanim.py`。
  Added `cli/pw.js` CLI and the `cli/pxanim.py` animation library.
- 示例工程 `examples/feng_warrior/`（部位图、精灵表、GIF）与 `WORKFLOW.md`。
  Example project and `WORKFLOW.md`.

## v1.2 — 2026-10-01

- 模板系统：保存/固定/导出导入，批量与单张结果一致。
  Template system: save, pin, export/import; batch matches single conversions.

## v1.1 — 2026-10-01

- 「模糊大图」预设与重新像素化、原尺寸导出（可直接替换游戏贴图）、吸色必保色。
  Blurry-big-image preset and re-pixelation, original-size export, eyedropper must-keep colours.

## v1.0 — 2026-10-01

- 首个版本：网格恢复、主色取样、去背景、色板吸附、杂色清理、编辑器、批量、多种导出。
  First release: grid recovery, per-cell sampling, background removal, palette snapping, noise cleanup, editor, batch, exports.
