# PoliceMate

PoliceMate is a procedural aid for police officers handling cases. Its language distinguishes the official case and legal process from the officer's private auxiliary checklist.

## Language

**案件**:
An administrative case formally handled under the applicable legal procedure. PoliceMate does not create an official case record or replace the police business system.
_Avoid_: Using “案件” to name the app's local checklist record

**办案清单**:
A private auxiliary checklist created by an officer to track procedural work for one administrative case. It is not an official case record, business ledger, or legal determination.
_Avoid_: App内案件、电子案卷、业务台账

**事实选择**:
A structured fact confirmed by the officer and used by PoliceMate to select procedural branches. It is user input, not a fact inferred from police business data or a legal finding made by the app.
_Avoid_: 自动识别、系统认定、案情录入

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

**告知任务**:
A 清单任务 that identifies who must be informed, when, what must be covered, what record or service step may be required, and the governing legal source. It is a verification aid, not personalized legal wording to be read verbatim.
_Avoid_: 自动告知、个性化法律话术

**可解释链路**:
The visible relationship from 事实选择, through a sourced rule, to every generated 清单任务 or 程序建议. A user must be able to see why an item appeared and which source supports it.
_Avoid_: 黑盒推荐、无法追溯的自动建议

**程序辅助工具**:
A tool that presents procedural tasks, time limits, conditions, exceptions, documents, notices, and legal sources for officers to verify. It does not decide case acceptance, case filing, legal classification, punishment, or criminal charges.
_Avoid_: 执法决定系统、自动办案系统、法律裁判工具
