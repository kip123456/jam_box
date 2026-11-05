## Purpose

在房间中提供多轨编曲核心——创建乐器轨道、在钢琴卷帘上拖拽编辑音符、solo/mute 控制、Tone.js 本地实时合成播放、撤销/重做。这是合奏盒子的核心交互，也是 AI 编曲（Phase 4）和实时协同（Phase 5）的数据载体。

## ADDED Requirements

### Requirement: 轨道管理 CRUD
后端 MUST 提供完整的轨道管理 REST API，仅限房间成员操作。

#### Scenario: 创建轨道
- **WHEN** 房间成员提交 POST `/api/v1/rooms/:roomId/tracks` 含 `{ name, instrumentType, color? }`
- **THEN** 创建 Track 记录（roomId、position 为该房间最大 position + 1、solo=false、mute=false）
- **AND** 返回完整 Track 对象

#### Scenario: 获取房间所有轨道
- **WHEN** 房间成员 GET `/api/v1/rooms/:roomId/tracks`
- **THEN** 返回该房间所有轨道（按 position 排序）及其音符数据（每个轨道 notes 字段）

#### Scenario: 更新轨道
- **WHEN** 房间成员 PUT `/api/v1/tracks/:trackId` 修改 name/solo/mute/color/position
- **THEN** 更新对应字段
- **AND** 不能修改 roomId、instrumentType、createdBy 这些不可变字段

#### Scenario: 删除轨道
- **WHEN** 房间成员 DELETE `/api/v1/tracks/:trackId`
- **THEN** Track 记录及其所有关联 Note 一并删除（级联）
- **AND** 删除后其他轨道的 position 重新排列（不强制，也可以留 gap，MVP 直接 gap）

#### Scenario: 非房间成员操作
- **WHEN** 非房间成员尝试上述任何轨道操作
- **THEN** 返回 `{ code: 403, msg: "不是房间成员", data: null }`

### Requirement: 乐器类型约束
Track 的 instrumentType MUST 限制为预定义集合。

#### Scenario: 合法乐器类型
- **WHEN** 创建轨道时 instrumentType 为 `"piano"`、`"guitar"`、`"bass"`、`"drums"` 之一
- **THEN** 创建成功

#### Scenario: 非法乐器类型
- **WHEN** instrumentType 为不在预定义集合中的值
- **THEN** 返回 `{ code: 400, msg: "不支持的乐器类型", data: null }`

### Requirement: 音符模型约束
后端 MUST 为 Note 数据施加业务校验。

#### Scenario: 音符 pitch 范围
- **WHEN** 创建或更新音符
- **THEN** pitch 必须在 MIDI 0-127 范围内（对应钢琴卷帘 C-1 到 G9）

#### Scenario: 音符时间有效性
- **WHEN** 创建或更新音符
- **THEN** startTimeTicks ≥ 0，durationTicks ≥ 480（最短 1/4 拍）
- **AND** velocity 必须在 0-127 范围内

#### Scenario: 音符创建属于轨道
- **WHEN** 创建音符时指定 trackId
- **THEN** 该轨道必须存在且属于当前用户所在的房间
- **AND** 非该房间成员创建音符返回 403

### Requirement: 音符批量操作
后端 MUST 提供音符的批量操作接口，用于拖拽移动/删除多个音符时的高效同步。

#### Scenario: 批量创建音符
- **WHEN** 提交 POST `/api/v1/tracks/:trackId/notes/bulk` 含 notes 数组
- **THEN** 所有 Note 记录批量创建（原子操作，一个失败全部回滚）

#### Scenario: 批量更新音符
- **WHEN** 提交 PUT `/api/v1/tracks/:trackId/notes/bulk` 含 notes 数组（每个带 id + 要修改的字段）
- **THEN** 所有 Note 记录批量更新（原子操作）

#### Scenario: 批量删除音符
- **WHEN** 提交 DELETE `/api/v1/tracks/:trackId/notes/bulk` 含 `{ noteIds: string[] }`
- **THEN** 指定音符全部删除（原子操作）

### Requirement: 房间详情包含轨道数据
GET `/api/v1/rooms/:id` 的响应 MUST 包含该房间所有轨道及其完整音符数据，让前端进入房间时一次性加载。

#### Scenario: 获取房间详情含轨道
- **WHEN** 房间成员 GET `/api/v1/rooms/:id`
- **THEN** 响应中除了房间基本信息外，包含 `tracks: Track[]` 数组
- **AND** 每个 Track 对象包含完整的 `notes: Note[]` 数组（每个 Note 含 pitch、startTimeTicks、durationTicks、velocity）

### Requirement: 前端钢琴卷帘
前端 MUST 提供钢琴卷帘 UI（时间轴 × MIDI 音高网格），支持拖拽添加/移动/删除音符。

#### Scenario: 添加音符
- **WHEN** 用户在钢琴卷帘空白处点击
- **THEN** 该轨道、该音高、该时间位置创建一个新音符（默认 duration 一个拍 = 480 ticks，velocity 默认 100）
- **AND** 新音符通过 POST `/tracks/:trackId/notes` 持久化到后端

#### Scenario: 移动音符
- **WHEN** 用户拖拽一个音符到新的时间位置或新的音高
- **THEN** 该音符的 startTimeTicks 和/或 pitch 更新
- **AND** 调用 PUT `/api/v1/tracks/:trackId/notes/bulk` 批量更新（一次拖拽可能导致多个音符移动）

#### Scenario: 删除音符
- **WHEN** 用户选中一个或多个音符后按 Delete 键或右键删除
- **THEN** 调用 DELETE `/api/v1/tracks/:trackId/notes/bulk` 删除

#### Scenario: 音符视觉渲染
- **WHEN** 钢琴卷帘渲染轨道音符
- **THEN** 每个音符显示为彩色矩形（颜色来自 Track.color）
- **AND** 垂直位置对应 pitch，水平位置对应 startTimeTicks，宽度对应 durationTicks
- **AND** 顶部显示时间轴（BPM 标尺），左侧显示钢琴键盘（C4 居中可见）

### Requirement: 轨道列表 UI
前端 MUST 在钢琴卷帘左侧显示轨道列表。

#### Scenario: 轨道渲染
- **WHEN** 房间加载完成
- **THEN** 左侧显示轨道列表，每条含乐器图标、轨道名、solo 开关、mute 开关、删除按钮
- **AND** 底部有"添加轨道"按钮

#### Scenario: Solo 功能
- **WHEN** 某轨道启用 solo
- **THEN** 播放时只有该轨道（及其他 solo 轨道）发出声音，mute 轨道不发声，非 solo 非 mute 轨道也不发声
- **AND** UI 上 solo 激活的轨道高亮显示

#### Scenario: Mute 功能
- **WHEN** 某轨道启用 mute
- **THEN** 播放时该轨道静音
- **AND** UI 上 mute 激活的轨道变灰

#### Scenario: 添加轨道
- **WHEN** 用户点击"添加轨道"按钮
- **THEN** 弹出选择乐器的下拉菜单
- **AND** 选择后自动创建新轨道（POST），新轨道出现在列表底部并自动选中

### Requirement: 播放控制
前端 MUST 提供播放/暂停/停止、BPM 调整、循环区域控制。

#### Scenario: 播放
- **WHEN** 用户点击"播放"按钮或按空格键
- **THEN** 从当前位置开始，Tone.js 根据音符数据实时合成播放
- **AND** 播放过程中，钢琴卷帘上有一个垂直播放头（playhead）实时移动指示当前时间位置

#### Scenario: 暂停/停止
- **WHEN** 用户点击"暂停"或"停止"
- **THEN** Tone.js 播放立即停止，所有正在发声的乐器静默

#### Scenario: 调整 BPM
- **WHEN** 用户在播放控件中修改 BPM 值（默认 120，范围 40-240）
- **THEN** Tone.js transport 的 BPM 实时更新
- **AND** 已暂停的轨道在调整后再次播放时使用新 BPM

#### Scenario: 循环区域
- **WHEN** 用户设置循环起止时间点
- **THEN** 播放到循环结束后自动回到循环起点重新播放
- **AND** UI 上显示循环区域高亮

### Requirement: Tone.js 本地合成
前端 MUST 使用 Tone.js 在浏览器端实时合成音频，不依赖后端渲染。

#### Scenario: 不同乐器发声
- **WHEN** 播放钢琴轨道
- **THEN** Tone.js 使用 Piano 或 PolySynth 合成钢琴音色

- **WHEN** 播放吉他/贝斯轨道
- **THEN** Tone.js 使用对应合成器或采样音色

- **WHEN** 播放鼓轨道
- **THEN** Tone.js 使用 Drumkit 合成打击乐

#### Scenario: 多轨同时播放
- **WHEN** 多个轨道同时有音符在播放
- **THEN** 所有未 mute 且未被 solo 排斥的轨道同时发声，形成合奏效果

#### Scenario: 浏览器音频上下文启动
- **WHEN** 用户在页面上首次点击播放或任何交互
- **THEN** Tone.js AudioContext 从 suspended 状态激活（浏览器安全策略要求用户手势）
- **AND** 激活后控制台输出 AudioContext 已启动的日志（开发模式）

### Requirement: 撤销/重做
前端 MUST 提供撤销（Ctrl+Z）和重做（Ctrl+Shift+Z / Ctrl+Y）快捷键支持。

#### Scenario: 撤销添加音符
- **WHEN** 用户添加一个音符后按 Ctrl+Z
- **THEN** 该音符删除，前端调用 DELETE 同步到后端

#### Scenario: 撤销移动音符
- **WHEN** 用户移动一批音符后按 Ctrl+Z
- **THEN** 所有音符回到移动前的位置

#### Scenario: 重做
- **WHEN** 用户撤销一次后按 Ctrl+Shift+Z
- **THEN** 撤销的操作被恢复

#### Scenario: 撤销/重做边界
- **WHEN** 没有可撤销的操作时按 Ctrl+Z
- **THEN** 不产生任何效果（无错误提示）

### Requirement: 时间粒度与 BPM 配置
音符时间 MUST 以 tick 为单位，前端 MUST 支持 BPM 可配置。

#### Scenario: tick 与秒的转换
- **WHEN** BPM = 120 时
- **THEN** 1 tick = 0.0104 秒（480 ticks = 1/4 拍 = 0.5 秒）

#### Scenario: BPM 范围
- **WHEN** 用户设置 BPM
- **THEN** 允许范围 40-240，默认 120
- **AND** 非数字或越界值前端校验阻止提交

### Requirement: 房间详情页路由
前端 MUST 将 `/rooms/:id` 路由指向完整的多轨编辑页面（替换 Phase 2 的占位页）。

#### Scenario: 访问房间详情
- **WHEN** 已登录成员访问 `/rooms/:id`
- **THEN** 加载房间基本信息、所有轨道和音符数据
- **AND** 渲染完整多轨编辑界面（左侧轨道列表 + 中间钢琴卷帘 + 顶部播放控件）

#### Scenario: 非成员访问私有房间
- **WHEN** 非该私有房间成员访问 `/rooms/:id`
- **THEN** 显示"你不是该房间成员"提示
- **AND** 不加载轨道数据