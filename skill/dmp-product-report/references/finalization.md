# 正式分析与交付合同

## 固定输入：从骨架开始

`run`/`build`阶段为draft，同时输出以下文件，路径在回执analysisInputs.files中：

| 文件 | 消费方法 |
|---|---|
| analysis-input.md | 先读的紧凑分析摘要：目标、周期、来源状态、逐指标数值和变化、量价贡献、构成分母、行为特征及异常 |
| analysis-input.json | 稳定合同 `dmp-analysis-input@1`；完整精度规范化值、派生结果、来源引用与摘要范围，按需读取 |
| analysis.template.json | 本商品本次来源的完整空骨架，复制为新的分析文件后填写 |
| analysis.schema.json | JSON Schema 2020-12，动态枚举本次指标/场景/来源/组件ID，含可复用$defs |

已有ViewModel的离线补齐入口：`dmp-product-report analysis-input --viewmodel DRAFT.json --out-dir NEW_DIR --json`。只读已有数据并新建文件，不取数。常规run/build已自动生成，无需重复调用。

摘要values数组严格按periods顺序：near7、prior7、near30、prior30、w1…w8。精确值为number，缺失为null，区间为{lower,upper,raw}；比例原值为小数。比较结果保留绝对差和相对百分比，比例使用百分点；前期0、缺失和区间重叠分别标记。全期缺失用missing-all-periods，8周精确恒定用constant；区间和缺口不取中点、不补0。Markdown数值为阅读用显示精度，计算以JSON完整精度为准。

脚本负责固定计算与数据整理；Agent按知识方法选择证据、提炼经营走势与策略线索。使用摘要和来源即可分析，普通任务无需读取finalize.mjs、Python渲染器或前端JS，也无需写临时计算探针。画像摘要保留全部互斥维度分布、策略标签Top5；完整标签保留在ViewModel与原始来源，按需回查。

## 分析JSON v2

保留骨架中的analysisVersion=2、inputIdentity.itemId及sourceHash。其余顶层键如下，完整ID已在骨架展开，不能用展示中文名替代：

- metricAnalyses：全部8项经营指标。
- promotionAnalyses：场景ID → 本次8项推广指标ID；使用估算ROI时为estimatedDirectRoi。场景缺失也有对应骨架，明确无法判断。
- crowdAnalyses：people、orders、conversion、cartFavorite。
- businessInterpretations：metrics、promotion、crowd。
- businessOverview：综合概览。
- audienceAnalyses：本次要求画像时包含purchase、browse、favorite、cart、search。

每个逐指标对象填写conclusion、evidence和sourceRefs；经营解读、概览和画像对象还需label。可选note、strategy及componentRefs，其他字段不接收。conclusion是一句结论，evidence为编号呈现的短段字符串数组，**重点**渲染为局部加粗；通常3条，足以判断即可。缺失数据也须以事实和限制完成对应对象。

可直接替换骨架中sales对象的示例（数字仅演示，实际以本次摘要为准）：

```json
{
  "conclusion": "近期销售额回落，较长周期仍高于前期。",
  "evidence": [
    "近7天**900元**，前7天1000元，减少100元（10%）。",
    "近30天4000元，前30天3500元，增长14.29%。",
    "最新完整周900元，前周1000元；8周内出现过波动。"
  ],
  "sourceRefs": ["metrics:near7", "metrics:prior7", "metrics:near30", "metrics:prior30", "metrics:w7", "metrics:w8"],
  "componentRefs": ["metrics", "dataCoverage"],
  "note": "销售额按完整精度笔单价乘笔数推算，数据覆盖见数据覆盖表。"
}
```

sourceRefs是本对象采用的来源ID：metrics:周期、promotion:周期、crowd:周期、channelCosts:周期及audience:行为。只填写摘要sources中实际存在的ID；逐指标至少包含实际数值来源，画像至少包含本行为来源。渠道金额版charge引用channelCosts，estimatedDirectRoi同时引用promotion与channelCosts；其他推广指标引用promotion。摘要sourcePrefixes明确这些映射，不能将场景原始charge与人民币渠道汇总混用。摘要sources提供相对于原采集runDir的文件与ViewModel位置、业务状态和来源指纹。引用存在不代表结论已被证明，须核对证据含义和口径。

componentRefs仅选摘要components中的ID。dataCoverage对应真实渲染的12周期数据覆盖表；其他组件对应模块入口。显式组件引用及已识别的组件名称须有实际模板锚点。普通文字中的任意自然语言指代不能被机械穷举，写作时只引用清单中内容。人群图表数值表与数据覆盖表分别使用，不混称。

旧版仅含5或6个分析键的历史JSON仍可离线finalize；新骨架统一用v2，以绑定目标/来源并核对引用。原始数据、来源指纹和图表字段由CLI沿用ViewModel，不能在分析JSON中注入替代值。

## 一次校验、一次正式渲染

```sh
dmp-product-report finalize --viewmodel DRAFT.json --analysis ANALYSIS.json --out NEW.html --json
```

需要先检查时，可选：`dmp-product-report check-analysis --viewmodel DRAFT.json --analysis ANALYSIS.json --json`。这与finalize使用相同输入检查，不要求常规任务多跑一遍。一次返回全部独立可修复缺项，带path、code或rule及expected，repairCount为数量；缺失父对象只报告可修复父节点。修正分析时另存新文件，不覆盖旧证据。输入不合格时不渲染HTML；产物校验失败则保留验证证据，修复后输出新HTML。

正式输出HTML、NEW.html.ViewModel.json和NEW.html.validation.json，均独占新建。完成回执包含artifacts、sourceHash、analysisHash、HTML/ViewModel哈希、组件清单和引用、checks、issues、repairCount、readyForDelivery、completion、next。

- readyForDelivery=true、next=deliver-artifacts：直接交付文件，常规流程结束。
- completion=partial-data或blocked-capability：可以交付已保存的部分报告与具体缺口；完整分析保持未完成，不补0或省略模块。
- issues非空：一起修复已列缺项；不手改readyForDelivery或跳过真实校验。

## 脚本验收边界

build核对原始接口商品/日期/字段映射。finalize一次核对ViewModel商品身份、12标准周期、字段/分组、空值/区间、销售额/ROI和渠道金额、分析覆盖与引用；解析器递归核对srcdoc内嵌数据、离线资源、模块/覆盖组件及覆盖表12行与ViewModel的内容一致性，Node检查内联脚本语法。采用script-delivery@2验收合同。

确定性检查保证保存数据与产物合同，不能证明平台数据真实、自然语言因果或策略判断正确，也不证明所有浏览器布局/运行时交互。分析质量由第4步的知识方法和来源约束承接。日常交付不追加浏览器截图、目视抽查、逐按钮检查、独立模块渲染或预览服务；固定模板回归属于包开发维护，用户另行要求展示故障诊断时才执行。登录与取数所需的账号验证仍按采集节点处理。

新采集的channelCosts覆盖不足、画像缺失、日期未核实、未知状态或能力缺口不能标为完整。平台实际空结果保持空/未知。原始platformDirectRoi与计算estimatedDirectRoi分别保留；跨接口归因未完全核实，区间重叠不确认精确改善。
