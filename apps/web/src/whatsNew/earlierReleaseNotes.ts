/** Recovered from t3-version-map. These builds predate the What's New list. */
export const EARLIER_RELEASE_NOTES = [
  {
    version: "0.0.98",
    title: "0.0.95 through 0.0.98",
    highlights: [
      "These installers were packed without separate notes. They carried the Grok Bot binary path, the picker allowlist, and the default model move from grok-build to grok-4.6.",
    ],
  },
  {
    version: "0.0.94",
    title: "0.0.94",
    highlights: ["Oh My Pi JSON-RPC Internal error 不要顯示成 Schema defect。"],
  },
  {
    version: "0.0.93",
    title: "0.0.93",
    highlights: ["點 Direct spawn 打開完整 session；Back 回 fleet。"],
  },
  {
    version: "0.0.92",
    title: "0.0.92",
    highlights: ["一版四件事：occupancy bar、Grok Bot 模型過濾、Orb icon、picker 順序。"],
  },
  {
    version: "0.0.91",
    title: "0.0.91",
    highlights: ["Direct spawn 卡逐筆 stream 子 agent 的 tool 與 thinking；Stop 看起來像真按鈕。"],
  },
  {
    version: "0.0.90",
    title: "0.0.90",
    highlights: ["補 0.0.88：Bot 要能 startSession，catalog 只留 grokbot。"],
  },
  {
    version: "0.0.89",
    title: "0.0.89",
    highlights: [
      "展開 Monitoring 或 scheduled 列時顯示 schedule 和 last log，不要空的 No result recorded。",
    ],
  },
  {
    version: "0.0.88",
    title: "0.0.88",
    highlights: [
      "一版三件事：Grok Bot 獨立 provider；同 driver 已有自訂 instance 時藏起停用的 default slot；沒 checkpoint 的編輯改送成新訊息。",
    ],
  },
  {
    version: "0.0.87",
    title: "0.0.87",
    highlights: ["一版兩件事：本機 Windows 包可被 Check for Updates 裝上；以及 OMP Grok Bot。"],
  },
  {
    version: "0.0.86",
    title: "0.0.86",
    highlights: ["只剩一個 custom Codex instance 時，顯示成 Codex，不要 humanize 成重複 slug。"],
  },
  {
    version: "0.0.85",
    title: "0.0.85",
    highlights: ["daily-sync。"],
  },
  {
    version: "0.0.84",
    title: "0.0.84",
    highlights: ["SDK 常把 1M 模型回報成 200k，meter 看起來 100%。"],
  },
  {
    version: "0.0.83",
    title: "0.0.83",
    highlights: [
      "chrome 改回英文；context breakdown 改 Claude 式色標＋堆疊條；used 模式連 fill 一起反轉；注入的 <language> 不要當成 user 訊息。",
    ],
  },
  {
    version: "0.0.82",
    title: "0.0.82",
    highlights: ["Grok／Cursor／OpenCode 第一次普通 turn 加上同一段 zh-TW。"],
  },
  {
    version: "0.0.81",
    title: "0.0.81",
    highlights: [
      "Claude/Codex 常駐 zh-TW 規則；Claude/Codex/Grok 提供 Compact；context popover 列出 input/cache/output（當時中文標籤）。",
    ],
  },
  {
    version: "0.0.80",
    title: "0.0.80",
    highlights: ["Settings 可在 left / used 之間切配額標籤。"],
  },
  {
    version: "0.0.79",
    title: "0.0.79",
    highlights: ["未登入的 provider 出現 Log in，並打開官方 CLI 的可見 console。T3 不寫 token。"],
  },
  {
    version: "0.0.78",
    title: "0.0.78",
    highlights: ["CLI oauth／usage-state 都失敗時，讀 Claude Desktop plan-usage-history.json。"],
  },
  {
    version: "0.0.77",
    title: "0.0.77",
    highlights: ["plan 配額改 N% left，對齊 ChatGPT Usage。"],
  },
  {
    version: "0.0.76",
    title: "0.0.76",
    highlights: ["Claude oauth 空、CLI 看起來登出時，改讀 usage-state.json。"],
  },
  {
    version: "0.0.75",
    title: "0.0.75",
    highlights: ["所有 provider 配額條改顯示 used percent。"],
  },
  {
    version: "0.0.74",
    title: "0.0.74",
    highlights: [
      "Claude 身分用 oauthAccount.emailAddress；Grok 空的 unified-billing 不當配額；OpenRouter 不要把 unlimited 畫成 100%。",
    ],
  },
  {
    version: "0.0.73",
    title: "0.0.73",
    highlights: ["Grok thread 可切 Fast Mode，跟 Claude/Cursor 一樣。"],
  },
  {
    version: "0.0.72",
    title: "0.0.72",
    highlights: ["拿掉 sidebar 版號；performance bar 可改大小。"],
  },
  {
    version: "0.0.71",
    title: "0.0.71",
    highlights: ["Monitoring 標題被當成 icon 子節點，字被裁成「M」。"],
  },
  {
    version: "0.0.70",
    title: "0.0.70",
    highlights: [
      "Performance bar 上色。Delay 和 FPS 跟最新 animation frame，不是凍住的 500ms 平均。",
    ],
  },
  {
    version: "0.0.69",
    title: "0.0.69",
    highlights: ["62 的 overlay 蓋住 composer。"],
  },
  {
    version: "0.0.68",
    title: "0.0.68",
    highlights: ["Monitoring 列不透明，聊天與 Stop 不要穿過去。"],
  },
  {
    version: "0.0.67",
    title: "0.0.67",
    highlights: ["queue 排到 composer 後面（z-0）。"],
  },
  {
    version: "0.0.66",
    title: "0.0.66",
    highlights: ["配額從卡頭移到 Account email 下面。"],
  },
  {
    version: "0.0.65",
    title: "0.0.65",
    highlights: ["slash chip 是 absolute，高 prompt 不會一起捲。"],
  },
  {
    version: "0.0.64",
    title: "0.0.64",
    highlights: ["queue 表面不透明，聊天不要透出來。"],
  },
  {
    version: "0.0.63",
    title: "0.0.63",
    highlights: [
      "queue 變成 composer 抽屜（最多 3 行）；Goal 跟抽屜疊；有真 tool 時藏 thinking 列。",
    ],
  },
  {
    version: "0.0.62",
    title: "0.0.62",
    highlights: ["Cursor 風格 footer：FPS、500ms 最長 delay、jank、JS heap。"],
  },
  {
    version: "0.0.61",
    title: "0.0.61",
    highlights: ["Goal 測試改打 ChatView 同一顆 helper；密度測試解 ClientSettingsSchema。"],
  },
  {
    version: "0.0.60",
    title: "0.0.60",
    highlights: ["Goal strip 可檢視；inline /goal token；tool-call 密度；provider 間距。"],
  },
  {
    version: "0.0.59",
    title: "0.0.59",
    highlights: ["Slash chip 不透明。從 /goal 的 user 文字推出 Goal strip，放在 composer 上方。"],
  },
  {
    version: "0.0.58",
    title: "0.0.58",
    highlights: ["個人 Goal skill 會把 native /goal 擠掉。"],
  },
  {
    version: "0.0.57",
    title: "0.0.57",
    highlights: ["plan 配額改成 composer meter 點開 popover，不是 settings hover。"],
  },
  {
    version: "0.0.56",
    title: "0.0.56",
    highlights: ["thinking 先前只在換行／80 字才 flush，還被裁到 180。"],
  },
  {
    version: "0.0.55",
    title: "0.0.55",
    highlights: ["Direct spawn 卡變成 live tool + thinking log。"],
  },
  {
    version: "0.0.54",
    title: "0.0.54",
    highlights: ["Ctrl+F 搜 chat 與 Agents。"],
  },
  {
    version: "0.0.53",
    title: "0.0.53",
    highlights: ["monitor／schedule 卡在顯示截斷的 session path。"],
  },
  {
    version: "0.0.52",
    title: "0.0.52",
    highlights: ["chrome 不再只換色。"],
  },
  {
    version: "0.0.51",
    title: "0.0.51",
    highlights: ["Grok chrome 把整塊聊天塗成 #0a0a0a／#f4f4f5，light theme 正文消失。"],
  },
  {
    version: "0.0.50",
    title: "0.0.50",
    highlights: ["queue 從 composer 拆到上面；點舊 user 訊息可編（rewind + resend）。"],
  },
  {
    version: "0.0.49",
    title: "0.0.49",
    highlights: ["minimap 畫到 terminal 邊緣。"],
  },
  {
    version: "0.0.48",
    title: "0.0.48",
    highlights: ["chrome 跟各 app 的 layout／type，不只 accent。"],
  },
  {
    version: "0.0.47",
    title: "0.0.47",
    highlights: ["chrome 要真的看得見（送出鈕、composer ring、user bubble、header chip）。"],
  },
  {
    version: "0.0.46",
    title: "0.0.46",
    highlights: [
      "一版三件事：minimap hover preview 不要被 clip；摺疊 work-log 步驟名；救回 agent tool procedure。",
    ],
  },
  {
    version: "0.0.45",
    title: "0.0.45",
    highlights: ["clip timeline minimap；humanize work log；加 provider chrome。"],
  },
  {
    version: "0.0.44",
    title: "0.0.44",
    highlights: [
      "一版多件事：layoutMotion 預設開（忽略舊的 default-off interfaceAnimations）；Settings 顯示 APP_VERSION；OpenCode Go 剩餘從 zen/go/v1/usage；composer 蓋在 terminal 上（z-30）。",
    ],
  },
  {
    version: "0.0.43",
    title: "0.0.43",
    highlights: [
      "Grok child ACP session 不是 parent sessionId 就被丟掉，Agents 看不到 read_file／grep。",
    ],
  },
  {
    version: "0.0.42",
    title: "0.0.42",
    highlights: [
      "#8216 gap／surface 拆開後，clip panel／terminal，不要 translate GPU 層（xterm 會畫到聊天上）。",
    ],
  },
  {
    version: "0.0.41",
    title: "0.0.41",
    highlights: ["設定卡顯示剩餘訂閱配額。"],
  },
  {
    version: "0.0.40",
    title: "0.0.40",
    highlights: ["第一個 0.0.xx: 主題。"],
  },
  {
    version: "0.0.39",
    title: "0.0.39",
    highlights: ["Manual 可拖專案 thread，或依 provider 分組。"],
  },
  {
    version: "0.0.38",
    title: "0.0.38",
    highlights: ["queue 項目帶圖、像 Tasks 一樣展開、drain 時把照片加回去。"],
  },
  {
    version: "0.0.37",
    title: "0.0.37",
    highlights: ["queued follow-up 改成 composer 裡的 chip（不要第二條 bar）。"],
  },
  {
    version: "0.0.36",
    title: "0.0.36",
    highlights: [
      "摺疊 tool dump（Read basename，不要完整 Windows path）；Queue／Steer／New 與 stopped placeholder 要看得出來。",
    ],
  },
  {
    version: "0.0.35",
    title: "0.0.35",
    highlights: ["第一次四包一起改 version 欄（0.0.34→0.0.35）。"],
  },
  {
    version: "0.0.34",
    title: "0.0.34",
    highlights: [
      "merge origin/main；thinking 留 043，unsettled_at 當 044（上游想把 043 給 unsettled）。",
    ],
  },
  {
    version: "0.0.33",
    title: "0.0.33",
    highlights: [
      "合進上游 0.0.33 的 Usage 頁，並在同一版補上 Grok loops、monitors、Thinking，以及 Queue、Steer、New。",
    ],
  },
  {
    version: "0.0.32",
    title: "0.0.32",
    highlights: [
      "把 Grok Build ACP 控制接到當時的 T3 樹上（effort／plan／workflow／rewind／session extras）。",
    ],
  },
];
