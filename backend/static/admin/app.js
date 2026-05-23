(function () {
    var TOKEN_KEY = 'sgzj_admin_token';
    var THEME_KEY = 'sgzj_admin_theme';

    function getTheme() {
        return localStorage.getItem(THEME_KEY) || 'dark';
    }

    function setTheme(theme) {
        localStorage.setItem(THEME_KEY, theme);
        document.documentElement.setAttribute('data-theme', theme);
        updateThemeToggle(theme);
    }

    function updateThemeToggle(theme) {
        var sunIcon = document.getElementById('theme-icon-sun');
        var moonIcon = document.getElementById('theme-icon-moon');
        var label = document.getElementById('theme-label');
        if (theme === 'light') {
            if (sunIcon) sunIcon.style.display = 'block';
            if (moonIcon) moonIcon.style.display = 'none';
            if (label) label.textContent = '日间模式';
        } else {
            if (sunIcon) sunIcon.style.display = 'none';
            if (moonIcon) moonIcon.style.display = 'block';
            if (label) label.textContent = '夜间模式';
        }
    }

    setTheme(getTheme());

    var state = {
        token: localStorage.getItem(TOKEN_KEY),
        currentAdmin: null,
        currentPage: 'dashboard',
        usersPage: 1,
        auditPage: 1
    };

    var PAGE_TITLES = {
        dashboard: '仪表盘',
        users: '用户管理',
        admins: '管理员',
        config: '系统配置',
        announcements: '公告管理',
        'audit-logs': '审计日志'
    };

    var ICONS = {
        users: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
        memory: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2Zm0 18a8 8 0 1 1 8-8 8 8 0 0 1-8 8Z"/><path d="M12 6v6l4 2"/></svg>',
        chat: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>',
        uptime: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
        edit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>',
        trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>',
        power: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18.36 6.64a9 9 0 1 1-12.73 0"/><line x1="12" y1="2" x2="12" y2="12"/></svg>',
        lock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>',
        eye: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>',
        plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>'
    };

    function api(method, path, body) {
        var headers = { 'Content-Type': 'application/json' };
        if (state.token) {
            headers['Authorization'] = 'Bearer ' + state.token;
        }
        var opts = { method: method, headers: headers };
        if (body && method !== 'GET') {
            opts.body = JSON.stringify(body);
        }
        return fetch(path, opts).then(function (res) {
            if (res.status === 401) {
                logout();
                throw new Error('登录已过期，请重新登录');
            }
            if (!res.ok) {
                return res.json().then(function (d) { throw new Error(d.detail || d.message || '请求失败'); });
            }
            return res.json();
        });
    }

    function formatDate(d) {
        if (!d) return '-';
        return new Date(d).toLocaleString('zh-CN');
    }

    function formatUptime(seconds) {
        if (!seconds && seconds !== 0) return '-';
        var d = Math.floor(seconds / 86400);
        var h = Math.floor((seconds % 86400) / 3600);
        var m = Math.floor((seconds % 3600) / 60);
        var parts = [];
        if (d > 0) parts.push(d + '天');
        if (h > 0) parts.push(h + '小时');
        parts.push(m + '分钟');
        return parts.join(' ');
    }

    function showToast(msg, type) {
        type = type || 'info';
        var container = document.getElementById('toast-container');
        var el = document.createElement('div');
        el.className = 'toast ' + type;
        el.textContent = msg;
        container.appendChild(el);
        setTimeout(function () {
            el.remove();
        }, 4000);
    }

    function showModal(html) {
        document.getElementById('modal-content').innerHTML = html;
        document.getElementById('modal-overlay').style.display = 'flex';
    }

    function hideModal() {
        document.getElementById('modal-overlay').style.display = 'none';
        document.getElementById('modal-content').innerHTML = '';
    }

    function showLogin() {
        document.getElementById('login-page').style.display = 'flex';
        document.getElementById('main-app').style.display = 'none';
    }

    function showMain() {
        document.getElementById('login-page').style.display = 'none';
        document.getElementById('main-app').style.display = 'flex';
    }

    function logout() {
        state.token = null;
        state.currentAdmin = null;
        localStorage.removeItem(TOKEN_KEY);
        showLogin();
    }

    function switchPage(page) {
        state.currentPage = page;
        document.querySelectorAll('.page-section').forEach(function (s) {
            s.classList.remove('active');
        });
        document.querySelectorAll('.nav-item').forEach(function (n) {
            n.classList.remove('active');
        });
        var section = document.getElementById('page-' + page);
        if (section) section.classList.add('active');
        var nav = document.querySelector('.nav-item[data-page="' + page + '"]');
        if (nav) nav.classList.add('active');
        document.getElementById('page-title').textContent = PAGE_TITLES[page] || page;
        loadPage(page);
    }

    function loadPage(page) {
        switch (page) {
            case 'dashboard': loadDashboard(); break;
            case 'users': loadUsers(); break;
            case 'admins': loadAdmins(); break;
            case 'config': loadConfig(); break;
            case 'announcements': loadAnnouncements(); break;
            case 'audit-logs': loadAuditLogs(); break;
        }
    }

    function statusBadge(isActive) {
        if (isActive) {
            return '<span class="status-badge active">已激活</span>';
        }
        return '<span class="status-badge inactive">已停用</span>';
    }

    function roleBadge(role) {
        var cls = role === 'super_admin' ? 'super_admin' : 'admin';
        var text = role === 'super_admin' ? '超级管理员' : '管理员';
        return '<span class="role-badge ' + cls + '">' + text + '</span>';
    }

    function priorityBadge(priority) {
        var map = { high: '高', normal: '普通', low: '低' };
        return '<span class="priority-badge ' + priority + '">' + (map[priority] || priority) + '</span>';
    }

    function paginationHtml(current, total, pages) {
        if (pages <= 1) return '';
        var html = '';
        html += '<button onclick="window._goPage(' + (current - 1) + ')"' + (current <= 1 ? ' disabled' : '') + '>上一页</button>';
        var start = Math.max(1, current - 2);
        var end = Math.min(pages, current + 2);
        for (var i = start; i <= end; i++) {
            html += '<button class="' + (i === current ? 'active' : '') + '" onclick="window._goPage(' + i + ')">' + i + '</button>';
        }
        html += '<span class="page-info">共 ' + total + ' 条</span>';
        html += '<button onclick="window._goPage(' + (current + 1) + ')"' + (current >= pages ? ' disabled' : '') + '>下一页</button>';
        return html;
    }

    function loadDashboard() {
        api('GET', '/admin/dashboard').then(function (data) {
            var cards1 = document.getElementById('dashboard-cards');
            var cards2 = document.getElementById('dashboard-cards-row2');
            
            cards1.innerHTML = '' +
                '<div class="stat-card">' +
                    '<div class="stat-card-icon">' + ICONS.users + '</div>' +
                    '<div class="stat-card-label">总用户数</div>' +
                    '<div class="stat-card-value">' + (data.users.total || 0) + '</div>' +
                    '<div class="stat-card-sub">活跃: <span>' + (data.users.active || 0) + '</span> · 今日新增: <span>' + (data.users.today_new || 0) + '</span></div>' +
                '</div>' +
                '<div class="stat-card">' +
                    '<div class="stat-card-icon">' + ICONS.memory + '</div>' +
                    '<div class="stat-card-label">记忆总数</div>' +
                    '<div class="stat-card-value">' + (data.memories.total || 0) + '</div>' +
                    '<div class="stat-card-sub">分类数: <span>' + (Object.keys(data.memories.by_category || {}).length) + '</span></div>' +
                '</div>' +
                '<div class="stat-card">' +
                    '<div class="stat-card-icon">' + ICONS.chat + '</div>' +
                    '<div class="stat-card-label">对话总数</div>' +
                    '<div class="stat-card-value">' + (data.conversations.total || 0) + '</div>' +
                    '<div class="stat-card-sub">今日对话: <span>' + (data.conversations.today_count || 0) + '</span></div>' +
                '</div>' +
                '<div class="stat-card">' +
                    '<div class="stat-card-icon">' + ICONS.uptime + '</div>' +
                    '<div class="stat-card-label">运行时间</div>' +
                    '<div class="stat-card-value" style="font-size:22px;">' + formatUptime(data.system.uptime_seconds) + '</div>' +
                    '<div class="stat-card-sub">版本: <span>' + (data.system.version || '-') + '</span> · 数据库: <span>' + (data.system.db_size_mb || 0).toFixed(2) + ' MB</span></div>' +
                '</div>';

            var catHtml = '';
            var cats = data.memories.by_category || {};
            if (Object.keys(cats).length > 0) {
                catHtml = '<div class="stat-card" style="grid-column:span 4;"><div class="stat-card-icon">' + ICONS.memory + '</div><div class="stat-card-label">记忆分类分布</div><div style="display:flex;gap:20px;flex-wrap:wrap;margin-top:12px;">';
                for (var k in cats) {
                    catHtml += '<span style="color:var(--text-secondary);font-size:13px;">' + k + ': <strong style="color:var(--accent-primary);">' + cats[k] + '</strong></span>';
                }
                catHtml += '</div></div>';
            }
            cards2.innerHTML = catHtml;
        }).catch(function (e) {
            showToast('加载仪表盘失败: ' + e.message, 'error');
        });
    }

    function loadUsers(page, keyword, statusFilter) {
        state.usersPage = page || 1;
        keyword = keyword !== undefined ? keyword : document.getElementById('user-search').value;
        statusFilter = statusFilter !== undefined ? statusFilter : document.getElementById('user-status-filter').value;
        var params = 'page=' + state.usersPage + '&page_size=20';
        if (keyword) params += '&keyword=' + encodeURIComponent(keyword);
        if (statusFilter) params += '&is_active=' + statusFilter;
        api('GET', '/admin/users?' + params).then(function (data) {
            var tbody = document.getElementById('users-tbody');
            if (!data.items || data.items.length === 0) {
                tbody.innerHTML = '<tr><td colspan="6" class="empty-state">暂无数据</td></tr>';
            } else {
                tbody.innerHTML = data.items.map(function (u) {
                    return '<tr>' +
                        '<td>' + u.id + '</td>' +
                        '<td>' + escHtml(u.username) + '</td>' +
                        '<td>' + escHtml(u.nickname || '-') + '</td>' +
                        '<td>' + statusBadge(u.is_active) + '</td>' +
                        '<td>' + formatDate(u.created_at) + '</td>' +
                        '<td><div class="action-btns">' +
                        '<button class="btn btn-secondary btn-sm" onclick="window._userDetail(' + u.id + ')">详情</button>' +
                        '<button class="btn btn-secondary btn-sm" onclick="window._toggleUser(' + u.id + ',' + !u.is_active + ')">' + (u.is_active ? '停用' : '启用') + '</button>' +
                        '<button class="btn btn-secondary btn-sm" onclick="window._resetUserPwd(' + u.id + ')">重置密码</button>' +
                        '<button class="btn btn-danger btn-sm" onclick="window._deleteUser(' + u.id + ')">删除</button>' +
                        '</div></td>' +
                        '</tr>';
                }).join('');
            }
            document.getElementById('users-pagination').innerHTML = paginationHtml(data.page, data.total, data.pages);
        }).catch(function (e) {
            showToast('加载用户列表失败: ' + e.message, 'error');
        });
    }

    function loadAdmins() {
        api('GET', '/admin/auth/admins').then(function (data) {
            var tbody = document.getElementById('admins-tbody');
            if (!data || data.length === 0) {
                tbody.innerHTML = '<tr><td colspan="6" class="empty-state">暂无管理员</td></tr>';
            } else {
                tbody.innerHTML = data.map(function (a) {
                    var canDelete = state.currentAdmin && a.id !== state.currentAdmin.id;
                    return '<tr>' +
                        '<td>' + a.id + '</td>' +
                        '<td>' + escHtml(a.username) + '</td>' +
                        '<td>' + escHtml(a.display_name || '-') + '</td>' +
                        '<td>' + roleBadge(a.role) + '</td>' +
                        '<td>' + formatDate(a.created_at) + '</td>' +
                        '<td><div class="action-btns">' +
                        (canDelete ? '<button class="btn btn-danger btn-sm" onclick="window._deleteAdmin(' + a.id + ')">删除</button>' : '<span style="color:var(--text-muted);font-size:12px;">当前账户</span>') +
                        '</div></td>' +
                        '</tr>';
                }).join('');
            }
        }).catch(function (e) {
            showToast('加载管理员列表失败: ' + e.message, 'error');
        });
    }

    function loadConfig() {
        api('GET', '/admin/config').then(function (data) {
            var container = document.getElementById('config-container');
            var groups = {
                llm: { title: 'LLM 配置', icon: '🤖' },
                tts: { title: 'TTS 配置', icon: '🔊' },
                memory: { title: '记忆配置', icon: '🧠' },
                search: { title: '搜索配置', icon: '🔍' }
            };
            var html = '';
            for (var gk in groups) {
                var group = data[gk];
                if (!group) continue;
                var info = groups[gk];
                html += '<div class="config-group">';
                html += '<div class="config-group-title">' + info.icon + ' ' + info.title + '</div>';
                for (var key in group) {
                    var val = group[key];
                    var fullKey = gk + '.' + key;
                    var isMasked = String(val) === '***';
                    html += '<div class="config-item">';
                    html += '<div class="config-key">' + escHtml(key) + '</div>';
                    html += '<div class="config-value' + (isMasked ? ' masked' : '') + '">' + (isMasked ? '••••••••' : escHtml(String(val))) + '</div>';
                    if (!isMasked) {
                        html += '<button class="btn btn-secondary btn-sm" onclick="window._editConfig(\'' + fullKey + '\',\'' + escAttr(String(val)) + '\')">编辑</button>';
                    }
                    html += '</div>';
                }
                html += '</div>';
            }
            container.innerHTML = html;
        }).catch(function (e) {
            showToast('加载配置失败: ' + e.message, 'error');
        });
    }

    function loadAnnouncements() {
        api('GET', '/admin/announcements').then(function (data) {
            var tbody = document.getElementById('announcements-tbody');
            if (!data || data.length === 0) {
                tbody.innerHTML = '<tr><td colspan="6" class="empty-state">暂无公告</td></tr>';
            } else {
                tbody.innerHTML = data.map(function (a) {
                    return '<tr>' +
                        '<td>' + a.id + '</td>' +
                        '<td>' + escHtml(a.title) + '</td>' +
                        '<td>' + priorityBadge(a.priority) + '</td>' +
                        '<td>' + statusBadge(a.is_active) + '</td>' +
                        '<td>' + formatDate(a.created_at) + '</td>' +
                        '<td><div class="action-btns">' +
                        '<button class="btn btn-secondary btn-sm" onclick="window._editAnnouncement(' + a.id + ')">编辑</button>' +
                        '<button class="btn btn-danger btn-sm" onclick="window._deleteAnnouncement(' + a.id + ')">删除</button>' +
                        '</div></td>' +
                        '</tr>';
                }).join('');
            }
        }).catch(function (e) {
            showToast('加载公告失败: ' + e.message, 'error');
        });
    }

    function loadAuditLogs(page, action) {
        state.auditPage = page || 1;
        action = action !== undefined ? action : document.getElementById('audit-action-filter').value;
        var params = 'page=' + state.auditPage + '&page_size=20';
        if (action) params += '&action=' + encodeURIComponent(action);
        api('GET', '/admin/audit-logs?' + params).then(function (data) {
            var tbody = document.getElementById('audit-tbody');
            if (!data.items || data.items.length === 0) {
                tbody.innerHTML = '<tr><td colspan="6" class="empty-state">暂无日志</td></tr>';
            } else {
                tbody.innerHTML = data.items.map(function (l) {
                    return '<tr>' +
                        '<td>' + formatDate(l.created_at) + '</td>' +
                        '<td>' + escHtml(l.operator_name || '-') + '</td>' +
                        '<td>' + escHtml(l.action || '-') + '</td>' +
                        '<td>' + escHtml(l.target_type || '-') + '</td>' +
                        '<td>' + (l.target_id || '-') + '</td>' +
                        '<td style="max-width:240px;overflow:hidden;text-overflow:ellipsis;" title="' + escAttr(l.detail || '') + '">' + escHtml(l.detail || '-') + '</td>' +
                        '</tr>';
                }).join('');
            }
            document.getElementById('audit-pagination').innerHTML = paginationHtml(data.page, data.total, data.pages);
        }).catch(function (e) {
            showToast('加载审计日志失败: ' + e.message, 'error');
        });
    }

    function escHtml(s) {
        var d = document.createElement('div');
        d.textContent = s;
        return d.innerHTML;
    }

    function escAttr(s) {
        return s.replace(/&/g, '&amp;').replace(/'/g, '&#39;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    document.getElementById('btn-theme-toggle').addEventListener('click', function () {
        var current = getTheme();
        setTheme(current === 'dark' ? 'light' : 'dark');
    });

    function initApp() {
        if (state.token) {
            api('GET', '/admin/auth/me').then(function (admin) {
                state.currentAdmin = admin;
                onLoginSuccess();
            }).catch(function () {
                logout();
            });
        } else {
            showLogin();
        }
    }

    function onLoginSuccess() {
        showMain();
        document.getElementById('admin-name').textContent = state.currentAdmin.display_name || state.currentAdmin.username;
        var roleEl = document.getElementById('admin-role');
        roleEl.textContent = state.currentAdmin.role === 'super_admin' ? '超级管理员' : '管理员';
        roleEl.className = 'role-badge ' + state.currentAdmin.role;
        var navAdmin = document.getElementById('nav-admins');
        navAdmin.style.display = state.currentAdmin.role === 'super_admin' ? 'flex' : 'none';
        switchPage('dashboard');
    }

    document.getElementById('login-form').addEventListener('submit', function (e) {
        e.preventDefault();
        var btn = document.getElementById('login-btn');
        var errEl = document.getElementById('login-error');
        var username = document.getElementById('login-username').value.trim();
        var password = document.getElementById('login-password').value;
        if (!username || !password) {
            errEl.textContent = '请输入用户名和密码';
            errEl.style.display = 'block';
            return;
        }
        btn.disabled = true;
        errEl.style.display = 'none';
        fetch('/admin/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: username, password: password })
        }).then(function (res) {
            if (!res.ok) {
                return res.json().then(function (d) { throw new Error(d.detail || '登录失败'); });
            }
            return res.json();
        }).then(function (data) {
            state.token = data.access_token;
            localStorage.setItem(TOKEN_KEY, state.token);
            return api('GET', '/admin/auth/me');
        }).then(function (admin) {
            state.currentAdmin = admin;
            onLoginSuccess();
        }).catch(function (e) {
            errEl.textContent = e.message;
            errEl.style.display = 'block';
        }).finally(function () {
            btn.disabled = false;
        });
    });

    document.querySelectorAll('.nav-item').forEach(function (item) {
        item.addEventListener('click', function (e) {
            e.preventDefault();
            var page = this.getAttribute('data-page');
            if (page) switchPage(page);
        });
    });

    document.getElementById('btn-logout').addEventListener('click', function () {
        api('POST', '/admin/auth/logout').catch(function () { }).finally(function () {
            logout();
        });
    });

    document.getElementById('btn-change-pwd').addEventListener('click', function () {
        showModal(
            '<div class="modal-title">修改密码</div>' +
            '<div class="form-group"><label class="form-label">旧密码</label><div class="input-wrapper"><input type="password" class="input" id="pwd-old"></div></div>' +
            '<div class="form-group"><label class="form-label">新密码</label><div class="input-wrapper"><input type="password" class="input" id="pwd-new"></div></div>' +
            '<div class="form-group"><label class="form-label">确认新密码</label><div class="input-wrapper"><input type="password" class="input" id="pwd-confirm"></div></div>' +
            '<div id="pwd-error" class="error-msg" style="display:none;"></div>' +
            '<div class="modal-actions"><button class="btn btn-secondary" onclick="window._closeModal()">取消</button><button class="btn btn-primary" onclick="window._submitChangePwd()">确认</button></div>'
        );
    });

    document.getElementById('modal-overlay').addEventListener('click', function (e) {
        if (e.target === this) hideModal();
    });

    document.getElementById('btn-search-users').addEventListener('click', function () {
        loadUsers(1);
    });

    document.getElementById('user-search').addEventListener('keyup', function (e) {
        if (e.key === 'Enter') loadUsers(1);
    });

    document.getElementById('user-status-filter').addEventListener('change', function () {
        loadUsers(1);
    });

    document.getElementById('btn-search-audit').addEventListener('click', function () {
        loadAuditLogs(1);
    });

    document.getElementById('audit-action-filter').addEventListener('change', function () {
        loadAuditLogs(1);
    });

    document.getElementById('btn-create-admin').addEventListener('click', function () {
        showModal(
            '<div class="modal-title">创建管理员</div>' +
            '<div class="form-group"><label class="form-label">用户名</label><div class="input-wrapper"><input type="text" class="input" id="new-admin-username"></div></div>' +
            '<div class="form-group"><label class="form-label">密码</label><div class="input-wrapper"><input type="password" class="input" id="new-admin-password"></div></div>' +
            '<div class="form-group"><label class="form-label">显示名称</label><div class="input-wrapper"><input type="text" class="input" id="new-admin-display"></div></div>' +
            '<div class="modal-actions"><button class="btn btn-secondary" onclick="window._closeModal()">取消</button><button class="btn btn-primary" onclick="window._submitCreateAdmin()">创建</button></div>'
        );
    });

    document.getElementById('btn-create-announcement').addEventListener('click', function () {
        showModal(
            '<div class="modal-title">新建公告</div>' +
            '<div class="form-group"><label class="form-label">标题</label><div class="input-wrapper"><input type="text" class="input" id="ann-title"></div></div>' +
            '<div class="form-group"><label class="form-label">内容</label><div class="input-wrapper"><textarea class="input" id="ann-content" rows="5" style="resize:vertical;"></textarea></div></div>' +
            '<div class="form-group"><label class="form-label">优先级</label><div class="input-wrapper"><select class="input select" id="ann-priority"><option value="normal">普通</option><option value="high">高</option><option value="low">低</option></select></div></div>' +
            '<div class="modal-actions"><button class="btn btn-secondary" onclick="window._closeModal()">取消</button><button class="btn btn-primary" onclick="window._submitCreateAnn()">发布</button></div>'
        );
    });

    window._closeModal = function () {
        hideModal();
    };

    window._goPage = function (p) {
        if (state.currentPage === 'users') {
            loadUsers(p);
        } else if (state.currentPage === 'audit-logs') {
            loadAuditLogs(p);
        }
    };

    window._userDetail = function (id) {
        api('GET', '/admin/users/' + id).then(function (u) {
            var html = '<div class="modal-title">用户详情</div>';
            html += '<div class="detail-grid">';
            html += '<div class="detail-label">ID</div><div class="detail-value">' + u.id + '</div>';
            html += '<div class="detail-label">用户名</div><div class="detail-value">' + escHtml(u.username) + '</div>';
            html += '<div class="detail-label">昵称</div><div class="detail-value">' + escHtml(u.nickname || '-') + '</div>';
            html += '<div class="detail-label">状态</div><div class="detail-value">' + statusBadge(u.is_active) + '</div>';
            html += '<div class="detail-label">注册时间</div><div class="detail-value">' + formatDate(u.created_at) + '</div>';
            if (u.stats) {
                html += '<div class="detail-label">对话数</div><div class="detail-value">' + (u.stats.conversation_count || 0) + '</div>';
                html += '<div class="detail-label">记忆数</div><div class="detail-value">' + (u.stats.memory_count || 0) + '</div>';
                html += '<div class="detail-label">最后活跃</div><div class="detail-value">' + formatDate(u.stats.last_active_at) + '</div>';
            }
            html += '</div>';
            html += '<div class="modal-actions"><button class="btn btn-secondary" onclick="window._closeModal()">关闭</button></div>';
            showModal(html);
        }).catch(function (e) {
            showToast('获取用户详情失败: ' + e.message, 'error');
        });
    };

    window._toggleUser = function (id, newStatus) {
        var label = newStatus ? '启用' : '停用';
        if (!confirm('确定要' + label + '该用户吗？')) return;
        api('PUT', '/admin/users/' + id + '/status', { is_active: newStatus }).then(function () {
            showToast('已' + label + '该用户', 'success');
            loadUsers(state.usersPage);
        }).catch(function (e) {
            showToast('操作失败: ' + e.message, 'error');
        });
    };

    window._resetUserPwd = function (id) {
        showModal(
            '<div class="modal-title">重置用户密码</div>' +
            '<div class="form-group"><label class="form-label">新密码</label><div class="input-wrapper"><input type="password" class="input" id="reset-pwd-val"></div></div>' +
            '<div class="modal-actions"><button class="btn btn-secondary" onclick="window._closeModal()">取消</button><button class="btn btn-primary" onclick="window._submitResetPwd(' + id + ')">确认重置</button></div>'
        );
    };

    window._submitResetPwd = function (id) {
        var pwd = document.getElementById('reset-pwd-val').value;
        if (!pwd) { showToast('请输入新密码', 'error'); return; }
        api('PUT', '/admin/users/' + id + '/reset-password', { new_password: pwd }).then(function () {
            showToast('密码已重置', 'success');
            hideModal();
        }).catch(function (e) {
            showToast('重置失败: ' + e.message, 'error');
        });
    };

    window._deleteUser = function (id) {
        if (!confirm('确定要删除该用户吗？此操作不可恢复！')) return;
        api('DELETE', '/admin/users/' + id).then(function () {
            showToast('用户已删除', 'success');
            loadUsers(state.usersPage);
        }).catch(function (e) {
            showToast('删除失败: ' + e.message, 'error');
        });
    };

    window._deleteAdmin = function (id) {
        if (!confirm('确定要删除该管理员吗？')) return;
        api('DELETE', '/admin/auth/admins/' + id).then(function () {
            showToast('管理员已删除', 'success');
            loadAdmins();
        }).catch(function (e) {
            showToast('删除失败: ' + e.message, 'error');
        });
    };

    window._submitCreateAdmin = function () {
        var username = document.getElementById('new-admin-username').value.trim();
        var password = document.getElementById('new-admin-password').value;
        var displayName = document.getElementById('new-admin-display').value.trim();
        if (!username || !password) { showToast('用户名和密码不能为空', 'error'); return; }
        api('POST', '/admin/auth/create-admin', { username: username, password: password, display_name: displayName }).then(function () {
            showToast('管理员创建成功', 'success');
            hideModal();
            loadAdmins();
        }).catch(function (e) {
            showToast('创建失败: ' + e.message, 'error');
        });
    };

    window._editConfig = function (key, currentVal) {
        showModal(
            '<div class="modal-title">编辑配置</div>' +
            '<div class="form-group"><label class="form-label">' + escHtml(key) + '</label><div class="input-wrapper"><input type="text" class="input" id="config-edit-val" value="' + escAttr(currentVal) + '"></div></div>' +
            '<div class="modal-actions"><button class="btn btn-secondary" onclick="window._closeModal()">取消</button><button class="btn btn-primary" onclick="window._submitConfig(\'' + escAttr(key) + '\')">保存</button></div>'
        );
    };

    window._submitConfig = function (key) {
        var val = document.getElementById('config-edit-val').value;
        var updates = {};
        updates[key] = val;
        api('PUT', '/admin/config', { updates: updates }).then(function () {
            showToast('配置已更新', 'success');
            hideModal();
            loadConfig();
        }).catch(function (e) {
            showToast('更新失败: ' + e.message, 'error');
        });
    };

    window._submitCreateAnn = function () {
        var title = document.getElementById('ann-title').value.trim();
        var content = document.getElementById('ann-content').value.trim();
        var priority = document.getElementById('ann-priority').value;
        if (!title || !content) { showToast('标题和内容不能为空', 'error'); return; }
        api('POST', '/admin/announcements', { title: title, content: content, priority: priority }).then(function () {
            showToast('公告已发布', 'success');
            hideModal();
            loadAnnouncements();
        }).catch(function (e) {
            showToast('发布失败: ' + e.message, 'error');
        });
    };

    window._editAnnouncement = function (id) {
        api('GET', '/admin/announcements').then(function (list) {
            var ann = null;
            for (var i = 0; i < list.length; i++) {
                if (list[i].id === id) { ann = list[i]; break; }
            }
            if (!ann) { showToast('公告不存在', 'error'); return; }
            showModal(
                '<div class="modal-title">编辑公告</div>' +
                '<div class="form-group"><label class="form-label">标题</label><div class="input-wrapper"><input type="text" class="input" id="edit-ann-title" value="' + escAttr(ann.title) + '"></div></div>' +
                '<div class="form-group"><label class="form-label">内容</label><div class="input-wrapper"><textarea class="input" id="edit-ann-content" rows="5" style="resize:vertical;">' + escHtml(ann.content) + '</textarea></div></div>' +
                '<div class="form-group"><label class="form-label">优先级</label><div class="input-wrapper"><select class="input select" id="edit-ann-priority"><option value="normal"' + (ann.priority === 'normal' ? ' selected' : '') + '>普通</option><option value="high"' + (ann.priority === 'high' ? ' selected' : '') + '>高</option><option value="low"' + (ann.priority === 'low' ? ' selected' : '') + '>低</option></select></div></div>' +
                '<div class="form-group"><label class="form-label">状态</label><div class="input-wrapper"><select class="input select" id="edit-ann-active"><option value="true"' + (ann.is_active ? ' selected' : '') + '>激活</option><option value="false"' + (!ann.is_active ? ' selected' : '') + '>停用</option></select></div></div>' +
                '<div class="modal-actions"><button class="btn btn-secondary" onclick="window._closeModal()">取消</button><button class="btn btn-primary" onclick="window._submitEditAnn(' + id + ')">保存</button></div>'
            );
        }).catch(function (e) {
            showToast('获取公告失败: ' + e.message, 'error');
        });
    };

    window._submitEditAnn = function (id) {
        var title = document.getElementById('edit-ann-title').value.trim();
        var content = document.getElementById('edit-ann-content').value.trim();
        var priority = document.getElementById('edit-ann-priority').value;
        var isActive = document.getElementById('edit-ann-active').value === 'true';
        api('PUT', '/admin/announcements/' + id, { title: title, content: content, priority: priority, is_active: isActive }).then(function () {
            showToast('公告已更新', 'success');
            hideModal();
            loadAnnouncements();
        }).catch(function (e) {
            showToast('更新失败: ' + e.message, 'error');
        });
    };

    window._deleteAnnouncement = function (id) {
        if (!confirm('确定要删除该公告吗？')) return;
        api('DELETE', '/admin/announcements/' + id).then(function () {
            showToast('公告已删除', 'success');
            loadAnnouncements();
        }).catch(function (e) {
            showToast('删除失败: ' + e.message, 'error');
        });
    };

    window._submitChangePwd = function () {
        var oldPwd = document.getElementById('pwd-old').value;
        var newPwd = document.getElementById('pwd-new').value;
        var confirmPwd = document.getElementById('pwd-confirm').value;
        var errEl = document.getElementById('pwd-error');
        if (!oldPwd || !newPwd || !confirmPwd) {
            errEl.textContent = '请填写所有字段';
            errEl.style.display = 'block';
            return;
        }
        if (newPwd !== confirmPwd) {
            errEl.textContent = '两次输入的新密码不一致';
            errEl.style.display = 'block';
            return;
        }
        errEl.style.display = 'none';
        api('PUT', '/admin/auth/password', { old_password: oldPwd, new_password: newPwd }).then(function () {
            showToast('密码已修改，请重新登录', 'success');
            hideModal();
            logout();
        }).catch(function (e) {
            errEl.textContent = e.message;
            errEl.style.display = 'block';
        });
    };

    initApp();
})();
