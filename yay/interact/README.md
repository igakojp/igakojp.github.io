# Yay! 交流マップ

Yay! の公開プロフィールと公開タイムラインを読み取り、投稿データ内に構造化されている交流相手をネットワーク表示する静的サイトです。Vercel にそのままデプロイできます。

## デプロイ

1. `yay-interaction-analyzer` フォルダーを Vercel にインポートします。
2. Framework Preset は Other、Build Command は空欄、Output Directory は空欄のままにします。
3. デプロイします。ビルド工程や環境変数は不要です。

## 取得する情報

- `GET https://api.yay.space/v2/users/fresh/{user_id}`
- `GET https://api.yay.space/v2/posts/user_timeline?number=50&user_id={user_id}`
- 続きのページは `from_post_id` を指定して取得します。

ブラウザーから `https://proxy.cors.dev/` を経由して公開 GET API を呼び出します。ログイン、Cookie、認証情報は送信しません。CORS リレーは第三者サービスであり、停止・制限・仕様変更の可能性があります。

API応答はJSONとして解析する前にHTTPステータスとContent-Typeを確認します。HTMLページが返った場合（例：`<!DOCTYPE html>`）はJSON解析エラーでクラッシュせず、HTTPステータスと原因の候補を画面に表示します。

## 集計対象と制限

現在の公開タイムラインの投稿オブジェクトから、次の構造化情報を読み取ります。

- メンション (`mentions`)
- 返信先の投稿者 (`in_reply_to_post.user`)
- リポスト元の投稿者 (`shareable.post.user`)

同じユーザーは同じ投稿内で重複加算しません。取得した全ユーザーを交流数順に並べ、マップ上に表示します。分析中はページを取得するたびにマップと集計値を更新します。

**「そのアカウントと交流したすべての人」を完全に取得できるわけではありません。** 現在利用している公開タイムラインAPIだけでは、いいねした人・リアクションした人・投稿に記録されない閲覧者などの一覧を取得できません。また、取得できない投稿や削除済み投稿、非公開投稿も対象外です。画面の注記と取得率を確認してください。

非公開プロフィールのタイムラインは取得しません。DMや非公開情報にもアクセスしません。

## 追加機能（リアルタイム交流マップ）

- 投稿ページを取得するたびに、発見したユーザーを交流マップへ反映します。スキャン完了を待たずにグラフを確認できます。
- 表示人数は Top 10 / 20 / 30 / 40 / 50 から選択できます。順位は確認できた交流イベント数で決まります。
- グラフはユーザー数に応じて複数の同心円に分散し、50人でもノードや名前が重なりにくい配置です。
- 「画像をダウンロード」から、高解像度PNGをブラウザ内で生成して保存できます。外部画像生成APIやAPIキーは不要です。
- 投稿データにプロフィール画像が含まれないユーザーは、公開プロフィールAPIから追加取得を試みます。取得後はグラフの画像と名前を自動更新します。
- アバター画像の読み込みがCORS等で拒否された場合は、画像内ではユーザー名の頭文字を代わりに表示します。
- 分析履歴機能はありません。


## Yay! URL formats

- Profile pages: `https://yay.space/user/{user_id}`
- Conversation pages: `https://yay.space/conversation/{conversation_id}`

The analyzer accepts the `/user/{user_id}` profile URL as input. Evidence links open the matching `/conversation/{conversation_id}` page, and each discovered user detail includes a link to their `/user/{user_id}` profile.


## v5 changes
- Yay! official SVG wordmark is used in the header.
- Added a username visibility toggle; PNG export follows the same setting.
- Reworked the map into three spacious rings for up to 50 users.
- Hydrates every discovered user through the public profile endpoint so avatar URLs and display names can be filled in.
- Private status is determined only from the timeline API response (`error_code: -363`), not from a profile flag.
- Scans the accessible timeline until pagination is exhausted; no early stop based on the profile's post count.
- Counts mentions and replies as separate interaction events, even when the same user appears in both on one post. Reposts are not counted as direct interaction events.
- PNG export is 3000 × 3000.


## v6 visual polish
- PNG footer now contains only the official Yay! logo, with no extra captions.
- The graph uses a smaller, upward-shifted radial layout to reserve a clean logo area.
- Username labels use solid dark backgrounds so connector lines cannot show through them.
- Exported labels are shortened slightly to reduce crowding.


## v7 performance and API error handling
- Removed the fixed 1.1-second wait between cursor-based timeline pages. Pages are still requested sequentially because each next-page cursor depends on the previous response.
- Profile hydration remains bounded to three concurrent requests to avoid an uncontrolled burst of requests.
- Reuses fetched profile data within the current browser session and enables normal browser HTTP caching.
- Honors `Retry-After`, applies exponential backoff with jitter after transient failures, and shares a cooldown after HTTP 429 responses.
- Detects HTML/non-JSON responses before parsing and reports a readable diagnostic instead of `Unexpected token '<'`.
- Does not bypass server-side rate limits. If Yay! or the CORS relay throttles or blocks requests, scanning waits and reports the limitation.


## 投稿URLから分析を開始する機能

入力欄には投稿URL（例：`https://yay.space/post/614516067`）も指定できます。

1. 投稿IDをURLから抽出します。
2. `GET https://api.yay.space/v2/posts/{post_id}` を呼び出します。
3. 応答の `post.user.id` から投稿者のユーザーIDを取得します。
4. そのIDで既存の `GET /users/fresh/{user_id}` と公開タイムライン分析を開始します。

従来どおり、ユーザーIDやプロフィールURLを直接入力する方法も利用できます。


## PNG export size

The interaction-map PNG export is rendered at **1000 × 1000 pixels**.
The existing 3000 × 3000 drawing layout is scaled down during export, so the
map layout and positioning remain consistent while the downloaded file is smaller.
