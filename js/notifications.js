/**
 * notifications.js - 通知システムUIモジュール
 * バックグラウンド生成完了通知などを管理
 */

const NotificationUI = {
    panelOpen: false,

    /**
     * 通知システムを初期化
     */
    async init() {
        this.setupEventListeners();
        await this.updateBadge();
        // 古い通知を削除
        await QuizDB.deleteOldNotifications();
    },

    /**
     * イベントリスナーを設定
     */
    setupEventListeners() {
        // 通知ベルをクリック
        const bellBtn = document.getElementById('notification-bell');
        if (bellBtn) {
            bellBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.togglePanel();
            });
        }

        // パネル外クリックで閉じる
        document.addEventListener('click', (e) => {
            const panel = document.getElementById('notification-panel');
            const bellBtn = document.getElementById('notification-bell');
            if (this.panelOpen && panel && !panel.contains(e.target) && !bellBtn.contains(e.target)) {
                this.closePanel();
            }
        });

        // パネル内のイベント委譲
        const panel = document.getElementById('notification-panel');
        if (panel) {
            panel.addEventListener('click', async (e) => {
                // 確認ボタン
                if (e.target.classList.contains('notification-action-btn')) {
                    const notificationId = e.target.dataset.notificationId;
                    const pendingId = e.target.dataset.pendingId;
                    await this.handleConfirmClick(notificationId, pendingId);
                }
                // 削除ボタン
                if (e.target.classList.contains('notification-delete-btn')) {
                    const notificationId = e.target.dataset.notificationId;
                    await this.deleteNotification(notificationId);
                }
            });

            // すべて既読ボタン
            const markAllReadBtn = panel.querySelector('.mark-all-read-btn');
            if (markAllReadBtn) {
                markAllReadBtn.addEventListener('click', async () => {
                    await QuizDB.markAllNotificationsAsRead();
                    await this.updateBadge();
                    await this.renderNotificationList();
                });
            }
        }
    },

    /**
     * パネルをトグル
     */
    async togglePanel() {
        if (this.panelOpen) {
            this.closePanel();
        } else {
            await this.openPanel();
        }
    },

    /**
     * パネルを開く
     */
    async openPanel() {
        const panel = document.getElementById('notification-panel');
        if (panel) {
            await this.renderNotificationList();
            panel.classList.add('active');
            this.panelOpen = true;
        }
    },

    /**
     * パネルを閉じる
     */
    closePanel() {
        const panel = document.getElementById('notification-panel');
        if (panel) {
            panel.classList.remove('active');
            this.panelOpen = false;
        }
    },

    /**
     * バッジを更新
     */
    async updateBadge() {
        const badge = document.getElementById('notification-badge');
        if (!badge) return;

        const count = await QuizDB.getUnreadNotificationCount();
        if (count > 0) {
            badge.textContent = count > 99 ? '99+' : count;
            badge.style.display = 'flex';
        } else {
            badge.style.display = 'none';
        }
    },

    /**
     * 通知リストをレンダリング
     */
    async renderNotificationList() {
        const listContainer = document.getElementById('notification-list');
        if (!listContainer) return;

        const notifications = await QuizDB.getAllNotifications();

        if (notifications.length === 0) {
            listContainer.innerHTML = `
                <div class="notification-empty">
                    <span class="notification-empty-icon">🔔</span>
                    <p data-i18n="notification.empty">通知はありません</p>
                </div>
            `;
            I18n.updateUI();
            return;
        }

        listContainer.innerHTML = notifications.map(n => this.renderNotificationItem(n)).join('');
        I18n.updateUI();
    },

    /**
     * 通知アイテムをレンダリング
     */
    renderNotificationItem(notification) {
        const timeAgo = this.formatTimeAgo(notification.created_at);
        const readClass = notification.read ? 'read' : 'unread';
        const icon = this.getNotificationIcon(notification.type);

        let actionButton = '';
        if (notification.type === 'ai_generation' && notification.data?.pendingRequestId) {
            actionButton = `
                <button class="notification-action-btn"
                        data-notification-id="${notification.id}"
                        data-pending-id="${notification.data.pendingRequestId}"
                        data-i18n="notification.confirm">確認する</button>
            `;
        }

        return `
            <div class="notification-item ${readClass}" data-id="${notification.id}">
                <div class="notification-icon">${icon}</div>
                <div class="notification-content">
                    <div class="notification-title">${QuizUI.escapeHtml(notification.title)}</div>
                    <div class="notification-message">${QuizUI.escapeHtml(notification.message)}</div>
                    <div class="notification-time">${timeAgo}</div>
                </div>
                <div class="notification-actions">
                    ${actionButton}
                    <button class="notification-delete-btn"
                            data-notification-id="${notification.id}"
                            title="削除">✕</button>
                </div>
            </div>
        `;
    },

    /**
     * 通知タイプに応じたアイコンを取得
     */
    getNotificationIcon(type) {
        switch (type) {
            case 'ai_generation':
                return '✨';
            case 'error':
                return '❌';
            default:
                return '📢';
        }
    },

    /**
     * 相対時間をフォーマット
     */
    formatTimeAgo(timestamp) {
        const now = Date.now();
        const diff = now - timestamp;
        const minutes = Math.floor(diff / 60000);
        const hours = Math.floor(diff / 3600000);
        const days = Math.floor(diff / 86400000);

        if (minutes < 1) return I18n.t('notification.time.justNow') || 'たった今';
        if (minutes < 60) return I18n.t('notification.time.minutesAgo', { minutes }) || `${minutes}分前`;
        if (hours < 24) return I18n.t('notification.time.hoursAgo', { hours }) || `${hours}時間前`;
        return I18n.t('notification.time.daysAgo', { days }) || `${days}日前`;
    },

    /**
     * 確認ボタンクリック時の処理
     */
    async handleConfirmClick(notificationId, pendingRequestId) {
        try {
            // 通知を既読に
            await QuizDB.markNotificationAsRead(notificationId);
            await this.updateBadge();

            // パネルを閉じる
            this.closePanel();

            // 保留中のリクエストを取得
            const pendingRequest = await QuizDB.getPendingRequest(pendingRequestId);
            if (!pendingRequest) {
                QuizUI.showToast('生成データが見つかりません', 'error');
                return;
            }

            if (pendingRequest.status !== 'completed') {
                QuizUI.showToast('問題生成はまだ完了していません', 'warning');
                return;
            }

            // プレビューモーダルを表示
            this.showPendingQuestionsPreview(pendingRequest);

        } catch (error) {
            console.error('確認処理エラー:', error);
            QuizUI.showToast('エラーが発生しました', 'error');
        }
    },

    /**
     * 保留中の問題のプレビューモーダルを表示
     */
    showPendingQuestionsPreview(pendingRequest) {
        // AIGeneratorのプレビューモーダルを再利用
        AIState.generatedQuestions = pendingRequest.questions;
        AIState.selectedQuestions = new Set(pendingRequest.questions.map((_, i) => i));
        AIState.targetSetId = pendingRequest.targetSetId;
        AIState.newSetName = pendingRequest.newSetName;
        AIState.pendingRequestId = pendingRequest.id;

        // モーダルを表示（AIGeneratorの既存関数を使用）
        if (typeof AIGenerator !== 'undefined' && AIGenerator.showPreviewModal) {
            AIGenerator.showPreviewModal(pendingRequest.questions);
        }
    },

    /**
     * 通知を削除
     */
    async deleteNotification(notificationId) {
        try {
            // 関連するpendingRequestも削除
            const notification = await QuizDB.getNotification(notificationId);
            if (notification?.data?.pendingRequestId) {
                await QuizDB.deletePendingRequest(notification.data.pendingRequestId);
            }

            await QuizDB.deleteNotification(notificationId);
            await this.updateBadge();
            await this.renderNotificationList();
        } catch (error) {
            console.error('通知削除エラー:', error);
        }
    },

    /**
     * 新しい通知を追加（外部から呼び出し用）
     */
    async addNotification(data) {
        await QuizDB.addNotification(data);
        await this.updateBadge();

        // パネルが開いていたらリストを更新
        if (this.panelOpen) {
            await this.renderNotificationList();
        }
    }
};

// グローバルにエクスポート
window.NotificationUI = NotificationUI;
