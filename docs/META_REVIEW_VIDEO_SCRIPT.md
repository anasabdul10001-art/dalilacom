# Meta App Review video: shot list and on-screen captions

Target length: 3 to 4 minutes. One continuous recording. English everywhere (site, Facebook, captions).
Permissions shown: `pages_show_list`, `pages_manage_metadata`, `pages_messaging`, `pages_read_engagement`.

## Before recording (about 10 minutes)

1. Facebook language: facebook.com, Settings, Language and region, set **English (US)** (set it back afterwards).
2. Remove the old consent so the full permission screen appears: facebook.com/settings?tab=business_tools, press **Remove** on the app **Dalilacom** (not "Dalilacom Responder").
3. Use a **private window** (Ctrl+Shift+N) so Chrome autofill shows nothing from earlier tests. Close every other tab.
4. dalilacom.com/app/ in English: Account menu, Language, English. Sign in as the merchant (Anas Abdulaziz). The Auto-responder must have no channel, no rule, and an empty Inbox (already cleaned).
5. Publish one short post on the Page "متجر الأمل التجريبي" (for the "Load my posts" step), for example: "Stainless steel water bottle, 5 dollars."
6. Customer: a **different** Facebook account (for example Nermeen Sa) on a phone or second browser, ready on m.me/1449090131622653. Never the merchant's own account.
7. Windows screen recorder (Win+Alt+R). Record the browser window only. No passwords on screen.

## Scenes (caption in quotes: type it as a text overlay or read it)

| Time | What you do | Caption |
|---|---|---|
| 0:00 | Open dalilacom.com/app/, show you are signed in | "Dalilacom is a business directory. Shop owners can connect their own Facebook Page to an auto-responder." |
| 0:15 | Auto-responder, tab **Channels** | "The merchant opens Channels." |
| 0:20 | Press **Connect with a Facebook account (easiest)** | "The merchant logs in with Facebook." |
| 0:30 | Facebook dialog: choose **Only current Pages**, tick the shop Page, Continue. **Stop 5 seconds on the review screen** showing the four permissions | "The merchant chooses which Page to share. Dalilacom asks for four permissions: list the Pages (pages_show_list), read the Page's posts (pages_read_engagement), subscribe the Page to our webhook (pages_manage_metadata), and read and answer its messages (pages_messaging)." |
| 1:00 | Press Save and Done. The page "Connected" appears, then **My connections** shows the Page name and Running | "The Page is connected. We store only a Page token, encrypted." |
| 1:15 | Tab **Rules**, create: name `Price question`, keyword `price`, reply `Our prices start at 5 dollars.` Press **Add rule** | "The merchant writes a rule: when a customer writes 'price', answer with this text." |
| 1:40 | In the same form: choose the connection, press **Load my posts**, show the post card, tick it, then clear it. Do not save a second rule | "The merchant can also limit a rule to one post (pages_read_engagement reads the Page's posts)." |
| 1:55 | Switch to the customer (other account): open the Page chat and send `price` | "A customer writes to the Page on Messenger." |
| 2:15 | Show the automatic reply arriving in the customer's Messenger | "The reply is sent in the same Messenger conversation (pages_messaging)." |
| 2:30 | Back on dalilacom.com, tab **Inbox** | "The merchant sees every conversation in the Inbox: the customer's message and the reply sent." |
| 2:50 | Tab **Channels**, press **Delete** on the connection, confirm | "The merchant can disconnect any time; the Page is unsubscribed and its conversations are deleted." |
| 3:05 | Open dalilacom.com/privacy.html and /data-deletion.html for 3 seconds each | "Privacy policy and data deletion instructions." |
| 3:15 | End | "We only read and answer messages sent to the connected Page. We never message anyone who has not written first." |

## After recording

- Watch it once without sound: every permission screen must be readable at 100% zoom.
- Put the Facebook language back to Arabic if you want, and the consent will have to be given again for the next real test.
- Credentials for the reviewer go only in the dashboard's reviewer-notes field (never in this repository).
