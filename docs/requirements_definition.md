# OpenAPI MCP Server 要件定義書

## 1. プロジェクト概要

OpenAPI定義ファイルを解析して、Model Context Protocol (MCP) サーバーを構築するツールを開発する。このサーバーは、AI（特にClaudeなど）がOpenAPI定義されたAPIエンドポイントを理解し、操作できるようにするためのブリッジとして機能する。

## 2. 目的

- OpenAPI定義からMCPツールへの自動変換を可能にする
- AIモデルがAPIエンドポイントを自然言語で操作できるようにする
- 開発者がAPIを素早く統合・テストできる環境を提供する

## 3. 技術要件

- **実装言語**: TypeScript
- **実行環境**: Bun
- **主要ライブラリ**:
  - `@modelcontextprotocol/sdk`: MCPサーバーの基本実装
  - `@apidevtools/swagger-parser`: OpenAPI仕様の解析
  - その他必要なライブラリ

## 4. 機能要件

### 4.1 基本機能

- OpenAPI定義ファイル（JSONまたはYAML）の読み込みと解析
- OpenAPIパスとメソッドからMCPツールへの変換
- MCPリクエストの処理とAPIリクエストへの変換
- APIレスポンスのフォーマットとMCPレスポンスへの変換

### 4.2 ツール作成機能

- 各APIエンドポイントをMCPツールとして定義
- ツール説明の自動生成
- パスパラメータ、クエリパラメータ、リクエストボディを入力スキーマに変換
- レスポンスタイプに基づいた出力形式の定義

### 4.3 リクエスト処理機能

- ツール一覧（ListTools）リクエストの処理
- ツール実行（CallTool）リクエストの処理
- パラメータの検証と変換
- APIリクエストの構築と実行

### 4.4 エラー処理

- OpenAPI解析エラーの処理
- リクエスト検証エラーの処理
- APIリクエストエラーの処理と適切なフィードバック

## 5. 実装要件

### 5.1 プロジェクト構成

```
openapi-mcp-server/
├── src/
│   ├── index.ts        # エントリーポイント
│   ├── parser.ts       # OpenAPI解析モジュール
│   ├── converter.ts    # ツール変換モジュール
│   ├── handlers.ts     # リクエストハンドラー
│   └── utils.ts        # ユーティリティ関数
├── package.json
├── tsconfig.json
└── README.md
```

### 5.2 主要モジュール

- **パーサーモジュール**: OpenAPI定義を解析する
- **コンバーターモジュール**: OpenAPIからMCPツールへの変換を行う
- **ハンドラーモジュール**: MCPリクエストを処理する
- **ユーティリティモジュール**: 共通機能を提供する

## 6. 実行手順

1. TypeScriptプロジェクトをBunで初期化
2. 必要なパッケージをインストール
3. コードを実装
4. Bunでビルド・実行
5. Claude Desktop設定ファイルで設定
6. Claude Desktopを使ってAPIと対話

## 7. 実行コマンド例

```bash
# インストールと初期化
bun create typescript openapi-mcp-server
cd openapi-mcp-server
bun add @modelcontextprotocol/sdk @apidevtools/swagger-parser openapi-types node-fetch

# ビルドと実行
bun build ./src/index.ts --outdir ./dist
bun run ./dist/index.js <openapi-spec-path> [base-url]
```

## 8. Claude Desktop設定例

```json
{
  "mcpServers": {
    "my-api": {
      "command": "bun",
      "args": ["run", "path/to/dist/index.js", "path/to/openapi.json", "https://api-base-url.com"]
    }
  }
}
```

## 9. 拡張要件（将来対応）

- 認証機能（API Key、OAuth等）のサポート
- 複雑なスキーマ（配列、ネストされたオブジェクト）の処理改善
- ファイルアップロードのサポート
- ストリーミングレスポンスのサポート
- UI（Web管理画面）の提供

## 10. 制約と注意点

- OpenAPI v3.1仕様への対応を優先
- セキュリティを考慮した設計（機密情報の扱い等）
- エラーメッセージはユーザーフレンドリーに
- デバッグモードの実装（ログ出力など）

## 11. 評価基準

- OpenAPI仕様に忠実にツールを生成できること
- エラー処理が適切に行われること
- レスポンスタイムが実用的であること
- AIモデルが理解・使用しやすいツール定義であること

本要件定義書は、OpenAPI定義からMCPサーバーを構築するための基本的な要件を定義したものである。実装にあたっては、具体的なAPI仕様や実行環境に応じて適宜調整を行うものとする。