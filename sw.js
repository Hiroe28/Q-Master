/**
 * sw.js - Service Worker
 * オフライン対応とキャッシュ管理
 */

const CACHE_NAME = 'quiz-app-v2';

// キャッシュするファイル一覧
const FILES_TO_CACHE = [
    './',
    './index.html',
    './css/base.css',
    './css/layout.css',
    './css/components.css',
    './css/quiz.css',
    './css/manage.css',
    './css/study.css',
    './css/sets.css',
    './css/ai-generator.css',
    './js/db.js',
    './js/ui.js',
    './js/export-import.js',
    './js/sm2.js',
    './js/state.js',
    './js/quiz.js',
    './js/manage.js',
    './js/sets.js',
    './js/study.js',
    './js/typing.js',
    './js/app.js',
    './manifest.webmanifest',
    './sample-data.json',
    // CDNライブラリもキャッシュ
    'https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css',
    'https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js',
    'https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/contrib/auto-render.min.js',
    'https://cdn.jsdelivr.net/npm/marked@12.0.0/marked.min.js',
    'https://cdn.jsdelivr.net/npm/dompurify@3.0.8/dist/purify.min.js',
    'https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js'
];

// インストール時にファイルをキャッシュ
self.addEventListener('install', (event) => {
    console.log('[Service Worker] インストール中...');

    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('[Service Worker] ファイルをキャッシュ中...');
                return cache.addAll(FILES_TO_CACHE);
            })
            .then(() => {
                console.log('[Service Worker] インストール完了');
                return self.skipWaiting();
            })
            .catch((error) => {
                console.error('[Service Worker] キャッシュエラー:', error);
            })
    );
});

// アクティベート時に古いキャッシュを削除
self.addEventListener('activate', (event) => {
    console.log('[Service Worker] アクティベート中...');

    event.waitUntil(
        caches.keys()
            .then((keyList) => {
                return Promise.all(keyList.map((key) => {
                    if (key !== CACHE_NAME) {
                        console.log('[Service Worker] 古いキャッシュを削除:', key);
                        return caches.delete(key);
                    }
                }));
            })
            .then(() => {
                console.log('[Service Worker] アクティベート完了');
                return self.clients.claim();
            })
    );
});

// フェッチ時の処理
self.addEventListener('fetch', (event) => {
    // ★ chrome拡張機能のリクエストはスキップ
    if (event.request.url.startsWith('chrome-extension://')) {
        return;
    }

    // POSTリクエストはキャッシュしない
    if (event.request.method !== 'GET') {
        return;
    }

    event.respondWith(
        caches.match(event.request)
            .then((cachedResponse) => {
                // キャッシュがあればそれを返す
                if (cachedResponse) {
                    return cachedResponse;
                }

                // キャッシュがなければネットワークから取得
                return fetch(event.request)
                    .then((response) => {
                        // 有効なレスポンスでなければそのまま返す
                        if (!response || response.status !== 200 || response.type !== 'basic') {
                            return response;
                        }

                        // レスポンスをクローンしてキャッシュに保存
                        const responseToCache = response.clone();
                        caches.open(CACHE_NAME)
                            .then((cache) => {
                                cache.put(event.request, responseToCache);
                            });

                        return response;
                    })
                    .catch((error) => {
                        console.error('[Service Worker] フェッチエラー:', error);

                        // オフライン時のフォールバック
                        if (event.request.destination === 'document') {
                            return caches.match('./index.html');
                        }
                    });
            })
    );
});

// プッシュ通知の受信（将来の拡張用）
self.addEventListener('push', (event) => {
    console.log('[Service Worker] プッシュ通知受信');
});

// バックグラウンド同期（将来の拡張用）
self.addEventListener('sync', (event) => {
    console.log('[Service Worker] バックグラウンド同期:', event.tag);
});