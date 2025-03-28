# OpenAPI MCP サーバー

このプロジェクトは、OpenAPI (v3) 仕様ファイルから Model Context Protocol (MCP) サーバーを生成します。これにより、Claude のような AI モデルが、定義された API エンドポイントと MCP ツールを通じて対話できるようになります。

## 要件

- [Bun](https://bun.sh/)

## インストール

1.  このプロジェクトをクローンまたはダウンロードします。
2.  プロジェクトディレクトリに移動します:
    ```bash
    cd openapi-mcp-server
    ```
3.  依存関係をインストールします:
    ```bash
    bun install
    ```

## ビルド

TypeScript コードを実行可能な JavaScript にコンパイルするには、Bun ランタイムをターゲットにします（`node-fetch`のような依存関係が Node.js API を使用するため必要です）:

```bash
bun build ./src/index.ts --outdir ./dist --target=bun
```

これにより、`dist` ディレクトリに出力ファイルが作成され、Bun 環境用に正しくバンドルされます。

## 手動実行（テスト/デバッグ用）

コンパイルされたサーバーをターミナルから直接実行できます。これは、解析や基本的な機能のテストに役立ちますが、設定しない限り MCP クライアントには接続しません。

```bash
bun run ./dist/index.js <openapi-specへのパス> [オプションのベースURL]
```

**引数:**

-   `<openapi-specへのパス>`: (必須) OpenAPI 仕様ファイル（JSON または YAML）への絶対パスまたは相対パス。
-   `[オプションのベースURL]`: (任意) OpenAPI 仕様で定義された `servers[0].url` を上書きするベース URL。省略され、仕様にサーバー URL が見つからない場合、サーバーはエラーで終了します。

**例:**

```bash
# 同梱のサンプル仕様を使用する場合
bun run ./dist/index.js ./openapi.yaml

# 別の仕様を使用し、ベースURLを上書きする場合
bun run ./dist/index.js /path/to/my/api.json https://my-api.example.com/v2
```

サーバーは標準エラー出力にログを出力し、標準入出力で MCP 通信を待ち受けます。`Ctrl+C` で停止します。

## MCP サーバーとしての設定（例: Claude Desktop / VS Code 拡張機能）

このサーバーを Claude VS Code 拡張機能のような MCP クライアントで利用可能にするには、適切な設定ファイルにその設定を追加します。

**`cline_mcp_settings.json` の例 (VS Code):**

*場所は異なる場合があります。例: macOS では `~/Library/Application Support/Code/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json`*

```json
{
  "mcpServers": {
    "my-custom-api": { // サーバーに一意の名前を選択
      "command": "bun",
      "args": [
        "run",
        // コンパイルされた index.js への *絶対パス* を使用
        "/path/to/your/openapi-mcp-server/dist/index.js",
        // OpenAPI 仕様への *絶対パス* を使用
        "/path/to/your/openapi-mcp-server/openapi.yaml"
        // 必要に応じてベースURLの上書きをここに追加
        // "https://override-base-url.com"
      ],
      "env": {
        // 必要な環境変数をここに追加（例: APIキー）
        // "API_KEY": "your-secret-key"
      },
      "disabled": false, // 一時的に無効にする場合は true に設定
      "autoApprove": [] // 必要に応じて自動承認するツール名をリスト
    }
    // ... 他のサーバー
  }
}
```

**重要:**

-   `/path/to/your/openapi-mcp-server/` を、システム上のこのプロジェクトディレクトリへの実際の絶対パスに置き換えてください。
-   `dist/index.js` と OpenAPI 仕様ファイルへのパスが正しい絶対パスであることを確認してください。
-   MCP クライアント（VS Code 拡張機能など）は、この設定に基づいてサーバープロセスを自動的に開始および管理します。MCP 経由で使用する場合、手動で実行する必要はありません。

設定が完了すると、クライアントはサーバーに接続し、（サンプル仕様の `listPets`、`showPetById` のような）生成されたツールを、AI に対応するアクションを実行するように依頼することで使用できます。
