# DMP 商品经营报告

`@petercjl/dmp-product-report` 是应用层 npm 包。输入一个淘宝或天猫商品编号，组合已授权的达摩盘取数能力，生成带概览、图表、分析和数据覆盖说明的独立HTML。

报告包含关键经营指标、推广策略、人群构成。四个汇总周期与最近8个完整自然周独立查询，原始证据、CSV和缺失状态同时保存。HTML模板和Python标准库渲染器随包携带，运行时不依赖外部HTML渲染包。

前提：Node.js 20+、Python 3.10+、具备 `dmp snapshot` 和 `dmp item-info` 合同的 `@petercjl/tbcli`，以及已授权登录的达摩盘账户。查询推广和人群对比需由用户明确选择本店锚点；已有选择可复用。该包不承诺任何商品或全部历史都能返回数据。

发给当前使用的Agent：

> 安装 @petercjl/dmp-product-report，完成配套Skill同步并检查依赖。

> 用 dmp-product-report 为商品【商品ID】生成经营分析报告。

安装与更新由当前Agent识别自己的目录并验证发现，见 [INSTALL.md](INSTALL.md)、[UPDATE.md](UPDATE.md)。macOS本机执行证据与Windows兼容性验证分别记录；具名Agent名单不构成产品适用白名单。

开发者入口：`version`、`capabilities --json`、`doctor --json`、`collect`、`build`、`run`、`finalize`、`skill source/status/install/update`、`update check/install`。机器可读目录语义和生命周期见 `capabilities.json`。普通任务只通知可用更新，安装更新需要明确授权与选定目标。

`run` 先生成数据草稿；Agent 按包内知识完成逐指标及经营解读后，用 `finalize` 生成正式报告并核验。图表与逐项证据默认展开，可手动收起。

报告标题下展示商品资料卡。商品资料与经营统计都使用DMP店铺会话，资料缺失明确标注；主图嵌入HTML。窄屏通过目录按钮展开左侧菜单，正文保留完整宽度。
