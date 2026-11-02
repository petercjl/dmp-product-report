# 正式报告输入合同

`run` 或 `build` 输出基础 ViewModel、CSV 与原始证据，阶段为 draft。Agent 按各分析节点的知识方法，读取该 ViewModel，另存分析 JSON；以原始返回形成结论，缺失时简明说明无法判断。

分析 JSON 旧证据沿用以下五项；包含行为画像的新采集增加第六项 `audienceAnalyses`（以purchase/browse/favorite/cart/search为键，各对象含label、conclusion、evidence及可选note），CLI 负责合并，目标ID、周期、图表数据及来源指纹沿用原始 ViewModel：

- `metricAnalyses`：以 `modules.metrics.metrics[].id` 为键，覆盖全部8项指标。
- `promotionAnalyses`：第一层以 `modules.promotion.scenes[].id` 为键，第二层以该模块8项指标ID为键。没有推广数值时仍覆盖“场景未返回”，结论说明数据不足。
- `crowdAnalyses`：以 `modules.crowd.metrics[].id` 为键，覆盖4项指标。
- `businessInterpretations`：键为 `metrics`、`promotion`、`crowd`，各自解读经营、推广及新老客成交结构。
- `businessOverview`：综合经营、推广、新老客及行为画像的结论。

逐指标分析对象：`{"conclusion":"一句结论","evidence":["**重点**及关键原值、对照与变化","另一条必要证据"],"note":"必要的口径或样本限制"}`。证据由知识方法选取，通常3条；足以判断即可。正文以编号短段呈现，`**重点**` 转成局部加粗。

三个模块的经营解读及概览对象增加 `label`（经营解读/推广解读/客群解读/综合概览）；可加 `strategy`（证据支持的策略判断）。先结论，再证据；将推断与事实区分，避免重复图表和优化建议。

执行当前拥有的运行入口：

```sh
dmp-product-report finalize --viewmodel DRAFT.json --analysis ANALYSIS.json --out NEW.html --json
```

输出为 HTML、`NEW.html.ViewModel.json` 和 `NEW.html.validation.json`，均独占新建。正式校验要求分析对象完整、三处图表默认展开、3个内置图表、概览有结论、无外部资源或私有路径。`readyForDelivery=true` 表示保存的数据合同、完整状态与正式产物的确定性检查通过。日常生成到此完成交付，不要求浏览器截图、目视抽查、桌面/手机检查或逐项点击。数据采集所需的账号验证仍按采集节点处理。

## 脚本验收与分析职责

- build核对原始接口商品/日期/字段映射，保留原始证据；finalize再核对ViewModel商品身份、标准12周期、模块字段与分组、缺失和区间、销售额/估算ROI公式、来源指纹格式及分析对象覆盖。来源指纹用于追踪，不能单独证明接口事实真实；已有证据应经build重建，不手改来源数据。
- HTML解析器递归检查三个iframe的srcdoc，验证JSON可解析、内嵌图表数据与ViewModel一致、离线资源及模块导航；Node校验内联脚本语法。正式验证保存HTML、ViewModel、分析的哈希及 `validationContract=script-delivery@1`，对应文件变更后需重新finalize到新路径。
- 完整性由已知完整状态、日期核对及必要来源覆盖共同决定；未知状态、采集失败、金额覆盖不足、画像缺失或能力缺口不能标为完整。平台确实返回空结果时保持空/未知，不补0，允许带说明交付。
- 分析策略负责结论、编号证据、经营解读与推断强度。脚本校验分析覆盖及内容存在，不能证明自然语言结论正确或因果成立；第4步仍须按各模块知识核实原值与解释。静态脚本不证明所有浏览器的布局和交互效果，不以此要求追加浏览器验收。
- 脚本校验失败时根据具体错误修复输入或模板，并输出新文件；保留失败证据，不手改验证结果或跳过检查。部分数据可生成正式格式的部分报告，`readyForDelivery=false`、`completion=partial-data`，清楚说明完整分析未完成。

新采集包含每周期channelCosts覆盖状态、同周期完整总额/已返回小计和独立来源指纹。正式渲染校验通过仅代表文件有效；存在partial数据或金额覆盖不足时readyForDelivery=false、completion=partial-data，允许查看已有内容，交付说明保持部分完成状态。历史报告沿用原有字段和来源。

采用渠道金额的新报告中，推广指标estimatedDirectRoi对应估算直接ROI；分析JSON按ViewModel实际指标ID覆盖。各周期platformDirectRoi保留原始平台ROI供明细展示，不能覆盖成计算值。
