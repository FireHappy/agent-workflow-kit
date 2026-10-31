# memory 模块

- `cache/`：临时证据、日志片段、待确认结论。超过 7 天应清理或转存。
- `history/`：长期归档，存放完整修复过程与可复用结论。

命名：

```text
cache/   <主题>_<YYYY-MM-DD>.md
history/ <主题>_<YYYY-MM-DD>.md
```

长期任务可在文件内写 `<!-- long-term: true -->` 免于过期清理。
