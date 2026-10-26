# 正式报告输入合同

`run` 或 `build` 输出基础 ViewModel、CSV 与原始证据，阶段为 draft。Agent 按各分析节点的知识方法，读取该 ViewModel，另存分析 JSON；以原始返回形成结论，缺失时简明说明无法判断。

分析 JSON 只包含以下五项，CLI 负责合并，目标ID、周期、图表数据及来源指纹沿用原始 ViewModel：

- `metricAnalyses`：以 `modules.metrics.metrics[].id` 为键，覆盖全部8项指标。
- `promotionAnalyses`：第一层以 `modules.promotion.scenes[].id` 为键，第二层以该模块8项指标ID为键。没有推广数值时仍覆盖“场景未返回”，结论说明数据不足。
- `crowdAnalyses`：以 `modules.crowd.metrics[].id` 为键，覆盖4项指标。
- `businessInterpretations`：键为 `metrics`、`promotion`、`crowd`，各自解读经营、推广及新老客成交结构。
- `businessOverview`：综合三个模块的结论。

逐指标分析对象：`{"conclusion":"一句结论","evidence":["**重点**及关键原值、对照与变化","另一条必要证据"],"note":"必要的口径或样本限制"}`。证据由知识方法选取，通常3条；足以判断即可。正文以编号短段呈现，`**重点**` 转成局部加粗。

三个模块的经营解读及概览对象增加 `label`（经营解读/推广解读/客群解读/综合概览）；可加 `strategy`（证据支持的策略判断）。先结论，再证据；将推断与事实区分，避免重复图表和优化建议。

执行当前拥有的运行入口：

```sh
dmp-product-report finalize --viewmodel DRAFT.json --analysis ANALYSIS.json --out NEW.html --json
```

输出为 HTML、`NEW.html.ViewModel.json` 和 `NEW.html.validation.json`，均独占新建。正式校验要求分析对象完整、三处图表默认展开、3个内置图表、概览有结论、无外部资源或私有路径。`readyForDelivery=true` 仅证明机械合同通过；Agent仍须核实结论与来源及实际浏览器交互。
