# ae-scripts

## ディレクトリ構成

ae-scripts/  
├─ packages/  
│ ├─ lib/ # 共通ライブラリ（logger, fs, etc）  
│ └─ script-template/ # テンプレ生成ツール  
│ │ ├─ src/ # スクリプトソース  
│ │ └─ dist/ # 完成スクリプト  
│ └─ script-◯◯◯◯/ # テンプレ生成ツール  
├─ tools/ # ビルドや自動化スクリプト  
└─ tests/ # 共通テスト
