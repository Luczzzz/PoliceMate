# PoliceMate

PoliceMate is a procedural aid for police officers handling cases. Its language distinguishes the official case and legal process from the officer's private auxiliary checklist.

## Language

**案件**:
An administrative case formally handled under the applicable legal procedure. PoliceMate does not create an official case record or replace the police business system.
_Avoid_: Using “案件” to name the app's local checklist record

**办案清单**:
A private auxiliary checklist created by an officer to track procedural work for one administrative case. It is not an official case record, business ledger, or legal determination.
_Avoid_: App内案件、电子案卷、业务台账

**候选事实**:
从用户原始表述中提取、但尚未由民警确认的一项案情陈述。候选事实可以进入确认界面和追问过程，但不能直接支撑初步定性意见。
_Avoid_: 已查明事实、系统认定、自动确认

**事实选择**:
A structured fact confirmed by the officer and used by PoliceMate to select procedural branches. It is user input, not a fact inferred from police business data or a legal finding made by the app.
_Avoid_: 自动识别、系统认定、案情录入

**争议事实**:
本次分析中存在不同说法、尚不能按单一版本确认的事实。它必须保留冲突表述，只能用于展示分支、缺口和核验事项，不能被系统静默选定。
_Avoid_: 系统采信事实、默认事实、已确认事实

**事实快照**:
一次分析在特定时点采用的候选、确认、否认、未知和争议事实的不可变集合。用户修改决定性内容后形成新快照，并使依赖旧快照的报告失效。
_Avoid_: 可直接覆盖的案情对象、分析历史、官方案卷版本

**决定性事实缺口**:
一个尚未确认、且其不同答案可能实质改变定性方向、受立案条件、证据优先级或重大风险判断的信息缺口。追问优先处理这类缺口，但允许民警回答未知、待核实或存在争议。
_Avoid_: 所有空字段、必填项缺失、模型想知道的信息

**连续案情**:
一次案情分析所覆盖的共同背景、人员关系或因果链相连的一组事件、人员和行为。彼此独立、需要分别研判的事项不应因出现在同一段输入中而合并。
_Avoid_: 单一案由、整段输入、无限案情集合

**派出所重点案情**:
第一版优先整理公开法源、分流条件和测试案例的一组派出所常见或高风险案情，包括派出所直接办理及首先接报、初步处置后可能移交的案情。它是内部内容建设清单，不代表官方发案率排名、产品对外承诺或用户可见的覆盖等级。
_Avoid_: 官方高发案由排名、专项覆盖等级、仅限派出所承办案件

**清单任务**:
A procedural action or verification item within a 办案清单. Marking it complete means the officer confirms it has been handled or checked; it does not mean PoliceMate has determined that the procedure is legally complete.
_Avoid_: 系统审批、自动合规判定

**关键时间点**:
A time entered by the officer that starts or affects a procedural time limit. It is auxiliary input and must be checked against the official case materials.
_Avoid_: 系统取数、业务系统时间

**时限提醒**:
An auxiliary reminder calculated from a 关键时间点 and an applicable public rule. It does not replace verification against currently effective law, regulations, official systems, or local requirements.
_Avoid_: 法定结论、系统截止时间

**程序建议**:
A traceable suggestion generated from the officer's 事实选择 that identifies a procedural path, next check, document, notice, approval, or missing time input. It is not a finding of fact, legal classification, punishment recommendation, or official decision.
_Avoid_: 法律结论、自动定性、处罚建议

**初步定性意见**:
An analytical opinion generated from confirmed 事实选择 and cited public legal sources about a possible offense or case category and its conditions. It is for officer review and verification, not an official case classification, filing decision, punishment recommendation, or legal determination.
_Avoid_: 案件定性结论、系统认定、最终定性

**文书任务**:
A 清单任务 that tells the officer which legal document may need to be prepared, approved, served, or checked, together with its trigger, required content, timing, and legal source. PoliceMate does not create or export the official document.
_Avoid_: 文书生成、电子文书、正式文书模板

**文书范例**:
一项只读、可追溯的制作指导内容，按适用条件说明文书结构、制作要点、常见错误和注释式虚构示例。它不是可直接套用的正式模板，不接收案情自动填充，也不替代办案系统中的现行格式。
_Avoid_: 正式文书模板、文书生成器、可直接制发的文书

**告知任务**:
A 清单任务 that identifies who must be informed, when, what must be covered, what record or service step may be required, and the governing legal source. It is a verification aid, not personalized legal wording to be read verbatim.
_Avoid_: 自动告知、个性化法律话术

**可解释链路**:
The visible relationship from 事实选择, through a sourced rule, to every generated 清单任务 or 程序建议. A user must be able to see why an item appeared and which source supports it.
_Avoid_: 黑盒推荐、无法追溯的自动建议

**内容维护者**:
第一版中对产品内容承担起草、核验、发布、更新和紧急下架责任的单一维护角色；该角色不代表法制审核、业务审定或机关授权。
_Avoid_: 法制审核员、审定人、官方发布人

**受治理内容项**:
可独立核验、版本化和下架的一项法源、分析规则、核查事项、询问要点、风险提示或文书范例。进入产品不表示已经正式审定。
_Avoid_: 已审定内容、官方口径、知识库全文

**内容发布批次**:
一组同时激活的受治理内容项及其确定版本，用于标识一次分析可使用的内容范围。批次可回滚，但不得把未经核验的内容混入当前批次。
_Avoid_: 实时知识库状态、自动生效内容

**程序辅助工具**:
A tool that presents procedural tasks, time limits, conditions, exceptions, documents, notices, and legal sources for officers to verify. It does not decide case acceptance, case filing, legal classification, punishment, or criminal charges.
_Avoid_: 执法决定系统、自动办案系统、法律裁判工具
