---
name: dmp-product-report
description: 输入淘宝或天猫商品ID，获取达摩盘经营、推广和新老人群周期数据，生成包含四周期对比、8周趋势、分类构成与分析的离线HTML报告。
---

# DMP 商品经营报告

## 输入与产出

输入一个商品ID；可选已明确选定的本店锚点、报告日和新的输出目录。使用当前有权访问的DMP会话。输出自包含HTML、12周期计划、原始证据、CSV、ViewModel、分析及验证结果。账号和历史可用范围以本次平台返回为准。

本Skill由 `@petercjl/dmp-product-report` 分发，应用方法和模板以包内此目录为准。模板与渲染器全部自带，Node.js 20+、Python 3.10+及具备 `dmp snapshot` 与 `dmp item-info` 的tbcli是运行前提。完整报告运行时不需要外部HTML渲染工具。

## 能力与执行入口

当前Agent根据自己的执行、文件和浏览器查看能力加载 `adapters/generic.json`；能力要求见 `capabilities.json`。具名Agent不是准入白名单。若已实体安装，使用此目录 `.runtime/bin/dmp-product-report.mjs`；包源码或npm安装使用 `dmp-product-report`。脚本入口 `scripts/run.mjs` 自动解析所属运行时。优先以此入口运行整个主线，保证执行版本与所读Skill一致。机器发现使用 `version --json`、`capabilities --json`、`skill source --all --json`。

到取数节点时，从当前宿主目录精确解析并完整加载 `tbcli` 的当前Skill及其DMP参考，核对 `tbcli dmp catalog --json` 是否包含 snapshotVersion=1对应快照能力及 itemInfo.version=1商品资料能力；缺失时返回 `TBCLI_SNAPSHOT_CAPABILITY_REQUIRED`，不临时直连接口。取数后返回本Skill的数据核对节点。

知识仅在当前 knowledge-dependent node 按需加载（on-demand）；后续节点 topics 与维护来源保持 deferred。

## 主线

1. **确认输入。** 保持用户的商品ID、查询日和授权上下文。仅当本店锚点尚未选择时，通过 `tbcli dmp items --json` 列出本店商品供用户选择；复用本次会话已选锚点，不把锚点当作目标商品。选择新的输出目录。
2. **确定周期。** 在周期决策节点进入 `references/queries/periods.md`，读取其方法并返回本步骤。以报告日前一天为日数据截止日，取近7天/前7天、近30天/前30天，及最近8个已经结束的周一至周日。
3. **检查并采集。** `dmp-product-report doctor --json` 通过后，执行 `dmp-product-report run --item-id ID --anchor-id OWNED_ID --as-of YYYY-MM-DD --out-dir NEW_DIR --json`。缺省报告日为上海当天。会话参数在本次全流程保持一致；已有可调试电商浏览器时，将其地址通过 `--cdp-url URL` 传入。`run` 产物标记为draft，必须继续完成下述分析和finalize节点。也可先 `collect` 再 `build --run-dir DIR`，用于分步检查。先调用 `tbcli dmp item-info` 获取目标商品资料，图片从返回的公共图片链接下载并嵌入HTML；再每周期独立调用tbcli快照，保留5类来源及业务状态。登录、验证码、访问限制立即停止；部分业务失败保留已有结果。
4. **核对并分析。** 进入 `references/queries/analysis.md`，核对日期、字段ID、空值、区间、合计、目标侧数据和来源口径，再返回本步骤。关键指标在本节点进入 `references/queries/metrics-analysis.md`，以8个指标为出发点，各自合看7天、30天与8个自然周，输出一句结论及编号短段证据，完成后返回本步骤。脚本生成的事实分析是基础，按知识方法补充后保存为新的分析文件／ViewModel，再进入渲染；知识更新不代表脚本已自动实现全部分析。推广在本节点进入 `references/queries/promotion-analysis.md`，按场景和指标合看三个尺度，保留区间/缺失，完成后返回本步骤。人群在本节点进入 `references/queries/crowd-analysis.md`，逐指标合看三个尺度，核对分类分母、合计和缺失，完成后返回本步骤。原因假设与确定事实分开。三个模块事实分析完成后进入 `references/queries/business-interpretation.md`，分别形成经营走势/策略线索、推广方式/力度/效果、新老客成交依赖与链接/店铺线索；再汇总概览，完成后返回本步骤。仅解读竞品，不给优化动作。
5. **独立渲染。** 将分析另存为新JSON，包含 `metricAnalyses`（8指标）、`promotionAnalyses`（每个返回场景8指标）、`crowdAnalyses`（4指标）、`businessInterpretations`（metrics/promotion/crowd）及 `businessOverview`。字段格式见 [正式报告输入合同](references/finalization.md)。执行 `dmp-product-report finalize --viewmodel DRAFT.json --analysis ANALYSIS.json --out NEW.html --json`，通过校验后输出正式报告与新ViewModel。底层随包 `scripts/render.py` 使用Python标准库和 `assets/` 模板。若需要调整分析，在首次渲染前修改分析输入或创建新的ViewModel与HTML，不覆盖已有交付。按概览、关键指标、推广策略、人群构成组织报告：模块先展示一句经营解读与编号证据，图表和逐项依据默认展开，用户可手动收起；概览最后综合三个模块，不新增未经支持的推断。
6. **验证交付。** 检查正式报告对应的 `.validation.json` 中 `readyForDelivery=true`、输出文件和12组证据是否齐全；使用当前Agent可用浏览器查看桌面与手机宽度、全部模块/指标/周期切换。缺失状态保持可见。交付HTML与数据目录，并报告缺口和异常原值。

## 商品身份与展示

桌面保留左侧菜单；窄屏用“报告目录”按钮展开左侧抽屉，让正文占满可用宽度。报告标题下、概览上方展示常驻商品卡：主图、完整商品名、ID、商品链接及已返回的店铺名称/链接。商品资料与统计数据均使用DMP店铺登录会话；通过 `tbcli dmp item-info --item-id ID --anchor-id OWNED_ID` 读取本店资料或DMP竞品选择列表中的精确ID结果。资料证据保存于 `evidence/product-info.json`，应用保存 `product.json` 并写入ViewModel；主图使用内嵌data URL，离线打开可见。店铺字段未返回时显示未知，不根据图片路径推算店铺。由shopId或商品ID构造的标准链接标明来源。

资料不可用时保留平台业务状态和商品ID，卡片明确缺失；不打开商品前台、不切换普通买家账户补采。资料ID与目标必须一致，命中错品立即停止。登录/验证码/限制遵循当前DMP会话的停止分支。

能力入口默认 `tbcli`，可用 `configure --tbcli-entry TOOL_ENTRY.mjs` 明确配置当前安装的能力入口，写入应用用户配置并验证snapshot/item-info合同；不改变其他Agent或全局CLI。

## 展示与数值边界

- 关键指标：7项平台指标及销售额，指标Tab同步切换当前指标的结论、编号证据和图表；同一图表区域切换四周期分组柱图与8周折线。IPV显示为访问量。
- 推广：按指标和场景同步切换一句结论、编号证据及精确值/区间图，保留四周期与8周；目标关键词有返回则记录，空列表保留未知。原始明细作为证据，不将本店字段混入目标。
- 人群：指标Tab同步切换一句结论、编号证据与图表；人群数和成交笔数使用分类圆环图，各周期颜色一致，4类同时比较；占比分母为已返回分类之和，平台合计独立核对。支付转化率、收加率使用分类柱图。
- 数量与金额的周期变化使用相对环比；比例使用百分点。前期为0、缺失和首周无对比分别处理。销售额以完整精度笔单价乘成交笔数。

## 分支与恢复

- `AUTH_REQUIRED` / 验证或限制：保存停止证据，由用户在同一浏览器完成处理；返回采集节点，使用新输出目录，只在明确恢复需求下重查。
- 空结果、查询失败：分别记录；独立来源继续处理，不补0，不移动日期来制造完整性。报告可部分成功，交付时说明。
- 日期回显不匹配：保留原始响应，经营图表标记未知。未回显日期不能声称实际覆盖已核实。
- 来源口径冲突、比例超过100%：保留原值并提示待核对；人群175与经营156分别解释。
- `OUTPUT_EXISTS`：选择新目录或新HTML路径。依赖缺失时返回具体依赖错误；不替换渲染链或改用未经验证的接口。

## 验收与演进

主线完成需有文件证据、数值核对和交互检查。可用 `build` 对已保存快照生成新报告；请求来源保留，不伪装为重新取数。修改周期或经营方法归应用层；平台协议与请求保护修复归tbcli。清洁上下文独立回归仅在用户单独要求时开展；普通完整试跑记为 main-run，而非 clean-regression。
