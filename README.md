# ae-scripts

## ディレクトリ構成

ae-scripts/  
├─ packages/  
│ ├─ lib/ # 共通ライブラリ（logger, fs, etc）  
│ └─ script-◯◯◯◯/ # スクリプト用ディレクトリ
│ │ ├─ src/ # スクリプトソース  
│ │ └─ dist/ # 完成スクリプト  
│ └─ script-template/ # テンプレ生成ツール  
├─ tools/ # ビルドや自動化スクリプト  
└─ tests/ # 共通テスト

# 1) ルートで依存解決

npm i

# 2) まずはサンプルをビルド

npm run build

# 3) dist/.jsx が生成されます（例：packages/script-hello/dist/hello.jsx）

# 4) AE の Scripts/ScriptUI Panels へ配置して動作確認
