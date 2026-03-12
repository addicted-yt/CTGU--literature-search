// ==UserScript==
// @name         三峡大学科研全自动收割机-V12.4
// @namespace    http://tampermonkey.net/
// @version      12.4
// @description  V12.4 加入两处兜底代码
// @author       yt
// @match        *://ids.ctgu.edu.cn/*
// @match        *://webvpn.ctgu.edu.cn/*
// @match        *://lib.ctgu.edu.cn/*
// @match        *://*.cnki.net/*
// @match        *://*.sciencedirect.com/*
// @match        *://61.136.151.252:7070/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @run-at       document-start
// ==/UserScript==

(function() {
    'use strict';

    // 调试日志函数
    function log(msg, data = "") {
        console.log(`%c[Rocket] ${msg}`, "color: #2563eb; font-weight: bold;", data);
    }

    // 简易进度提示窗口
    function setProgress(message) {
        let box = document.getElementById('rocket-progress');
        if (!message) {
            if (box && box.parentNode) box.parentNode.removeChild(box);
            return;
        }
        if (!box) {
            box = document.createElement('div');
            box.id = 'rocket-progress';
            box.style.position = 'fixed';
            box.style.bottom = '40px';
            box.style.left = '50%';
            box.style.transform = 'translateX(-50%)';
            box.style.zIndex = '999999';
            box.style.padding = '12px 22px';
            box.style.borderRadius = '999px';
            box.style.background = 'rgba(15,23,42,0.9)';
            box.style.color = '#e5e7eb';
            box.style.fontSize = '13px';
            box.style.boxShadow = '0 10px 25px rgba(0,0,0,0.5)';
            box.style.fontFamily = 'PingFang SC, Microsoft YaHei, sans-serif';
            document.body.appendChild(box);
        }
        box.textContent = message;
    }

    log("脚本 V11.4 已启动，执行环境扫描...");

    // 核心辅助函数：React 状态注入
    function setReactValue(el, value) {
        if (!el) return;
        try {
            const prototype = Object.getPrototypeOf(el);
            const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set || 
                           Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set ||
                           Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
            if (setter) {
                try { setter.call(el, value); } catch (err) { el.value = value; }
            } else { el.value = value; }
            ['input', 'change', 'blur'].forEach(type => {
                const event = new Event(type, { bubbles: true });
                event.simulated = true;
                el.dispatchEvent(event);
            });
        } catch (e) {
            el.value = value;
            el.dispatchEvent(new Event('input', { bubbles: true }));
        }
    }

    // 1. 数据初始化逻辑 (V11.4 隐形锚点技术 + V12.0 模式选择 + 抓取数量)
    function initData() {
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.has('u')) {
            log("捕获到启动参数，正在执行‘数据锚定’...");
            GM_setValue('task_user', urlParams.get('u'));
            GM_setValue('task_pass', urlParams.get('p') || "");
            GM_setValue('task_cn', urlParams.get('cn') || "");
            GM_setValue('task_en', urlParams.get('en') || "");
            GM_setValue('task_mode', urlParams.get('m') || "both");  // both | cnki | sd
            const rawN = urlParams.get('n') || "10";
            let parsed = parseInt(rawN, 10);
            if (!Number.isInteger(parsed) || parsed < 1 || parsed > 20) parsed = 10;
            GM_setValue('task_limit', parsed);
            GM_setValue('task_status', 'WAIT_LOGIN');
            
            // 如果是在图书馆页面捕获的，立即隐形跳往登录页进行判断
            if (window.location.href.includes('lib.ctgu.edu.cn')) {
                log("数据已安全存储，正在瞬间跳往登录页进行身份校验...");
                window.location.href = "https://ids.ctgu.edu.cn/authserver/login";
            }
        }
    }
    
    initData();

    // 2. 守卫检查
    let STATUS = GM_getValue('task_status');
    let USER = GM_getValue('task_user', ""), PASS = GM_getValue('task_pass', "");
    if (!STATUS && !USER) {
        log("脚本处于静默状态。");
        return;
    }

    let KW_CN = GM_getValue('task_cn', ""), KW_EN = GM_getValue('task_en', "");
    let LIMIT = GM_getValue('task_limit', 10);
    let MODE = GM_getValue('task_mode', "both"); // 任务模式：both / cnki / sd
    log(`当前任务状态: ${STATUS} | 关键词: ${KW_CN}`);

    // 站点识别
    const curUrl = window.location.href;
    const isCNKI = curUrl.includes('cnki.net') || curUrl.includes('cnki');
    const isSD = curUrl.includes('sciencedirect.com') || curUrl.includes('sciencedirect') || curUrl.includes('/sd/');
    const isLib = curUrl.includes('lib.ctgu.edu.cn');
    const isIDS = curUrl.includes('ids.ctgu.edu.cn');

    // 3. 登录与跳转逻辑 (V11.4 加固)
    const loginGuard = setInterval(() => {
        const url = window.location.href;
        if (isIDS && (url.includes("personalInfo") || url.includes("accountsecurity"))) {
            // 根据模式判断从哪一站点开始
            MODE = GM_getValue('task_mode', "both");
            const nextStatus = MODE === "sd" ? 'START_SD' : 'START_CNKI';
            GM_setValue('task_status', nextStatus);
            clearInterval(loginGuard);
            window.location.href = "http://lib.ctgu.edu.cn/";
            return;
        }
        if (isIDS && url.includes("login")) {
            let ticks = 0;
            const fillPoll = setInterval(() => {
                ticks++;
                const uInp = document.getElementById("username") || document.querySelector("input[name='username']") || document.querySelector("input[type='text']") || document.querySelector("input[placeholder*='账号'], input[placeholder*='学号']");
                const pInp = document.getElementById("password") || document.querySelector("input[name='password']") || document.querySelector("input[type='password']") || document.querySelector("input[placeholder*='密码']");
                const btn = document.querySelector(".auth_login_btn") || document.getElementById("loginSelf") || Array.from(document.querySelectorAll("button,input[type='submit']")).find(b => ((b.innerText||b.value||"").includes("登录")));
                if (uInp && pInp && USER) {
                    uInp.value = USER;
                    pInp.value = PASS || "";
                    uInp.dispatchEvent(new Event("input", {bubbles:true}));
                    pInp.dispatchEvent(new Event("input", {bubbles:true}));
                    setTimeout(() => { if (btn) btn.click(); }, 500);
                    clearInterval(fillPoll);
                    clearInterval(loginGuard);
                } else if (ticks > 120) {
                    clearInterval(fillPoll);
                }
            }, 500);
        }
    }, 500);

    // 4. 流程核心控制
    window.addEventListener('load', () => {
        STATUS = GM_getValue('task_status');
        
        if (STATUS === 'WAIT_LOGIN' && isLib) {
            GM_setValue('task_status', 'START_CNKI');
            STATUS = 'START_CNKI';
        }

        function poll(findTarget, action, maxWait = 15000) {
            let startTime = Date.now();
            const poller = setInterval(() => {
                if (Date.now() - startTime > maxWait) { clearInterval(poller); return; }
                const target = findTarget();
                if (target) { action(target); clearInterval(poller); }
            }, 500);
        }

        // 知网流程
        if (STATUS === 'START_CNKI' && isLib) { poll(() => Array.from(document.querySelectorAll('a')).find(a => a.innerText.trim() === 'CNKI中国知网'), (t) => { GM_setValue('task_status', 'NAV_TO_CNKI'); t.click(); }); }
        if (STATUS === 'NAV_TO_CNKI' && (curUrl.includes("dataBaseDetail") || curUrl.includes("databaseguide"))) { poll(() => document.querySelector('a.url.tfont-c2') || Array.from(document.querySelectorAll('a')).find(a => a.href.includes('redirect') && a.innerText.includes('cnki')), (t) => { GM_setValue('task_status', 'SEARCH_IN_CNKI'); window.location.href = t.href; }); }
        if (STATUS === 'SEARCH_IN_CNKI' && isCNKI) {
            poll(() => document.querySelector('textarea.search-input') || document.getElementById('txt_SearchText') || document.querySelector('#kw'), (t) => {
                t.focus(); t.value = KW_CN;
                ['input', 'change', 'blur', 'keyup'].forEach(evt => t.dispatchEvent(new Event(evt, { bubbles: true })));
                const b = document.querySelector('div.search-btn') || document.querySelector('.search-btn') || document.getElementById('btnSearch');
                GM_setValue('task_status', 'COLLECT_CNKI');
                setTimeout(() => { if(b) b.click(); else t.dispatchEvent(new KeyboardEvent('keydown', {key:'Enter', keyCode:13})); }, 1200);
            });
        }
        if (STATUS === 'COLLECT_CNKI' && isCNKI) {
            // 兼容列表模式和详情模式：只要任一结构出现就开始采集
            poll(
                () => document.querySelector(".result-table-list") ||
                      document.querySelector(".grid-table-list") ||
                      document.querySelector(".item") ||
                      document.querySelector("dl.result-detail-list dd"),
                () => setTimeout(() => handleDataCollection('cnki'), 2500)
            );
        }

        // 爱思唯尔流程
        if (STATUS === 'START_SD' && isLib) { poll(() => Array.from(document.querySelectorAll('a')).find(a => a.innerText.trim().includes('ScienceDirect')), (t) => { GM_setValue('task_status', 'NAV_TO_SD'); t.click(); }); }
        if (STATUS === 'NAV_TO_SD' && (curUrl.includes("dataBaseDetail") || curUrl.includes("databaseguide"))) { poll(() => document.querySelector('a.url.tfont-c2') || Array.from(document.querySelectorAll('a')).find(a => a.href.includes('redirect') && a.innerText.includes('sciencedirect')), (t) => { GM_setValue('task_status', 'SEARCH_IN_SD'); window.location.href = t.href; }); }
        if (STATUS === 'SEARCH_IN_SD' && isSD) {
            const sdBruteForce = setInterval(() => {
                // 适配首页“Find articles with these terms”输入框，仅填充英文关键词
                const input = document.querySelector('textarea#qs') ||
                              document.getElementById('qs') ||
                              document.querySelector('textarea[name="qs"]') ||
                              document.querySelector('input[name="qs"]') ||
                              document.querySelector('input[placeholder*="Find articles"]') ||
                              document.querySelector('input[aria-label*="Find articles"]');
                if (input && input.offsetParent !== null) {
                    const finalKW = (KW_EN || '').trim();
                    if (!finalKW) return; // Elsevier 仅使用英文；无英文则不执行
                    if (input.value !== finalKW) { setReactValue(input, finalKW); } 
                    else {
                        const searchBtn = document.getElementById('aa-srp-search-submit-button') ||
                                          document.querySelector('#aa-srp-search-submit-button button') ||
                                          Array.from(document.querySelectorAll('button, input[type="submit"]')).find(b => {
                                              const txt = (b.innerText + b.value + (b.getAttribute('aria-label') || '')).toLowerCase();
                                              return txt.includes('search') && !txt.includes('advanced');
                                          });
                        if (searchBtn) { searchBtn.click(); GM_setValue('task_status', 'COLLECT_SD'); clearInterval(sdBruteForce); }
                        else { input.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'Enter', keyCode: 13, which: 13 })); GM_setValue('task_status', 'COLLECT_SD'); clearInterval(sdBruteForce); }
                    }
                }
            }, 1500); 
            setTimeout(() => clearInterval(sdBruteForce), 25000);
        }
        if (STATUS === 'COLLECT_SD' && isSD) {
            if (curUrl.includes('search/entry') || curUrl.includes('search/advanced')) {
                const btn = document.getElementById('aa-srp-search-submit-button') || Array.from(document.querySelectorAll('button')).find(b => b.innerText.toLowerCase().includes('search') && !b.innerText.toLowerCase().includes('advanced'));
                if (btn) btn.click();
            } else { setTimeout(() => handleDataCollection('sd'), 5000); }
        }

        if (STATUS === 'PREPARE_DOWNLOAD' && isLib) { checkAndGenerate(); }
        // 仅知网模式：在 CNKI 页面进入 PREPARE_DOWNLOAD 时，先回到图书馆再生成 Word
        if (STATUS === 'PREPARE_DOWNLOAD' && isCNKI) { window.location.href = "http://lib.ctgu.edu.cn/"; }
        if (STATUS === 'START_SD' && isCNKI) { window.location.href = "http://lib.ctgu.edu.cn/"; }
        if (STATUS === 'PREPARE_DOWNLOAD' && isSD) { window.location.href = "http://lib.ctgu.edu.cn/"; }
    });

    // 采集函数 (V11.8 精准实现：CNKI 直接从详情块抓摘要 + SD 抽象加载轮询)
    function handleDataCollection(site) {
        let articles = [];
        if (site === 'cnki') {
            setProgress("正在收集知网 (CNKI) 信息，请耐心等待...");
            // 第一步：在列表页提取基础信息（作者、期刊、时间、链接）
            const baseArticles = [];
            const rows = document.querySelectorAll(".result-table-list tr, .grid-table-list tr, .item");
            rows.forEach(row => {
                const tLink = row.querySelector(".name a, .fz14 a, a.title, .name > a");
                if (!tLink || baseArticles.length >= LIMIT) return;
                const titleText = (tLink.innerText || "").trim();
                const authorsText = (row.querySelector(".author")?.innerText || "").trim();
                const journalText = (row.querySelector(".source")?.innerText || "").trim();
                const dateText = (row.querySelector(".date")?.innerText || "").trim();
                baseArticles.push({
                    title: titleText,
                    authors: authorsText || "未知",
                    journal: journalText || "CNKI",
                    date: dateText || "-",
                    link: tLink.href,
                    abs: "",
                    keywords: ""
                });
            });

            // 若当前检索词在知网完全无结果，直接根据模式进入下一阶段，避免无谓等待
            if (!baseArticles.length) {
                setProgress("");
                GM_setValue('data_cnki', JSON.stringify([]));
                const modeNow = GM_getValue('task_mode', "both");
                const nextStatusIfNone = modeNow === "cnki" ? 'PREPARE_DOWNLOAD' : 'START_SD';
                GM_setValue('task_status', nextStatusIfNone);
                window.location.reload();
                return;
            }

            // 用于将详情中的摘要/关键词合并到基础信息中
            const attachDetailInfo = () => {
                const detailItems = document.querySelectorAll("dl.result-detail-list dd");
                if (detailItems.length) {
                    detailItems.forEach(dd => {
                        const titleA = dd.querySelector(".middle h6 a, h6 a, h3 a, .middle h3 a, a");
                        if (!titleA) return;
                        const titleText = (titleA.innerText || "").trim();
                        const absBlock = dd.querySelector("p.abstract span:last-child, p.abstract, .abstract-section, .abstract, .abstract-text");
                        const kwBlock = dd.querySelector("p.keywords");
                        const absText = absBlock ? (absBlock.textContent || absBlock.innerText).replace(/摘要[:：]\s*/g, "").trim() : "";
                        const kwText = kwBlock ? Array.from(kwBlock.querySelectorAll("a")).map(a => (a.textContent || "").trim()).filter(Boolean).join(", ") : "";

                        const target = baseArticles.find(a => a.title === titleText) ||
                                       baseArticles.find(a => a.link === titleA.href);
                        if (target) {
                            if (absText) target.abs = absText;
                            if (kwText) target.keywords = kwText;
                        }
                    });
                }
                // 没有详情时，用列表页已有信息生成报告（摘要为空时给出提示语）
                articles = baseArticles.map(a => ({
                    ...a,
                    abs: a.abs || "摘要见详情",
                    keywords: a.keywords || ""
                }));
                if (articles.length > 0) {
                    setProgress("");
                    GM_setValue('data_cnki', JSON.stringify(articles));
                    const modeNow = GM_getValue('task_mode', "both");
                    // 仅知网模式：直接准备导出；其余模式：继续前往爱思唯尔
                    const nextStatus = modeNow === "cnki" ? 'PREPARE_DOWNLOAD' : 'START_SD';
                    GM_setValue('task_status', nextStatus);
                    window.location.reload();
                }
            };

            // 如果还未进入详情模式，先点击右上角“详情”按钮，再稍后抓取摘要/关键词
            const hasDetail = document.querySelector("dl.result-detail-list dd");
            if (!hasDetail) {
                const globalDetailBtn = document.querySelector("li.icon-detail, .licon-detail, .icon-detail, .icon-detail-x, [title*='详情']");
                if (globalDetailBtn) {
                    globalDetailBtn.click();
                    setTimeout(attachDetailInfo, 1800);
                    return;
                }
            }

            // 已经在详情模式，直接合并摘要/关键词
            attachDetailInfo();
            return;
        } else if (site === 'sd') {
            setProgress("正在收集爱思唯尔 (ScienceDirect) 信息，请耐心等待...");
            const items = Array.from(document.querySelectorAll(".result-item-content, li.SearchResultItem")).slice(0, LIMIT);
            if (items.length === 0) {
                GM_setValue('data_elsevier', JSON.stringify([]));
                GM_setValue('task_status', 'PREPARE_DOWNLOAD');
                setProgress("");
                window.location.reload();
                return;
            }
            let processed = 0;
            items.forEach(item => {
                let t = item.querySelector("h2 a, a[class*='title']");
                if (!t) { processed++; return; }
                // SD 日期修复：只从 article-date-fields 中“期刊名后的 span”提取日期
                let dateText = "Date pending";
                const root = item.closest("li") || item.parentElement || item;
                if (root) {
                    const dateContainer = root.querySelector(".article-date-fields") || root.querySelector(".srctitle-date-fields");
                    if (dateContainer) {
                        // 典型结构：<a>期刊名</a><span>April 2026</span>
                        const directSpans = Array.from(dateContainer.children).filter(el => el.tagName === "SPAN");
                        let dateSpan = null;
                        if (directSpans.length >= 2) {
                            // 最后一个 span 通常对应 ::after 的日期
                            dateSpan = directSpans[directSpans.length - 1];
                        } else if (directSpans.length === 1) {
                            dateSpan = directSpans[0];
                        } else {
                            // 退一步：选取不在 <a> 内、且包含年份的 span
                            dateSpan = Array.from(dateContainer.querySelectorAll("span"))
                                .find(el => !el.closest("a") && /\d{4}/.test((el.innerText || "").trim()));
                        }
                        if (dateSpan) {
                            let raw = (dateSpan.innerText || "").replace(/\s+/g, " ").trim();
                            // 优先匹配：日 月 年（6 March 2026）
                            const reDayMonthYear = /\b\d{1,2}\s+(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{4}\b/i;
                            // 月 日 年（March 6 2026 或 March 6, 2026）
                            const reMonthDayYear = /\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2},?\s+\d{4}\b/i;
                            // 月 年（March 2026）
                            const reMonthYear = /\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{4}\b/i;
                            // ISO：2026-03-06
                            const reISO = /\b\d{4}-\d{2}-\d{2}\b/;
                            const m1 = raw.match(reDayMonthYear);
                            const m2 = raw.match(reMonthDayYear);
                            const m3 = raw.match(reMonthYear);
                            const m4 = raw.match(reISO);
                            if (m1) {
                                dateText = m1[0];
                            } else if (m2) {
                                dateText = m2[0];
                            } else if (m3) {
                                dateText = m3[0];
                            } else if (m4) {
                                dateText = m4[0];
                            } else if (/\d{4}/.test(raw)) {
                                // 原始 span 文本里至少含年份，就直接使用
                                dateText = raw;
                            }
                        }
                    }
                    // 如果上述仍失败，则保留旧的“包含年份的短文本”兜底逻辑
                    if (dateText === "Date pending") {
                        let fallbackCandidates = Array.from(
                            root.querySelectorAll(
                                "[data-test='publication-date'], .publication-date, .article-date-fields span:not(.anchor-text), .srctitle-date-fields time, time, .year-volume, .published-online, .text-xs"
                            )
                        );
                        for (let el of fallbackCandidates) {
                            let txt = (el.innerText || "").trim();
                            if (txt && /\d{4}/.test(txt) && txt.length < 40) { dateText = txt; break; }
                        }
                    }
                }
                // 点击 Abstract 并轮询等待加载完成
                let absBtnSpan = item.querySelector("span.preview-button-text");
                let absBtn = absBtnSpan ? absBtnSpan.closest("button") : null;
                if (absBtn) absBtn.click();
                let triesAbs = 0;
                const pollAbs = setInterval(() => {
                    triesAbs++;
                    const loading = item.querySelector(".preview-body-container [role='progressbar'], .loading, .spinner");
                    const absEl = item.querySelector(".preview-body-container p, section.abstract-section p, .Body p, .snippet-text, div[class*='abstract'] p, [data-test='preview-text']");
                    if ((absEl && !loading) || triesAbs > 120) {
                        clearInterval(pollAbs);
                        articles.push({
                            title: t.innerText.trim(),
                            authors: item.querySelector("[data-test='author-list'], .authors, [class*='Author']")?.innerText.trim() || "Authors pending",
                            journal: item.querySelector(".publication-title, .srctitle-date-fields span:first-child")?.innerText.trim() || "SD",
                            date: dateText,
                            abs: absEl ? absEl.innerText.trim() : "Abstract preview pending",
                            link: t.href.startsWith('http') ? t.href : (window.location.origin + t.getAttribute('href'))
                        });
                        processed++;
                        if (processed >= items.length) {
                            if (articles.length > 0) {
                                GM_setValue('data_elsevier', JSON.stringify(articles));
                                GM_setValue('task_status', 'PREPARE_DOWNLOAD');
                                setProgress("");
                                window.location.reload();
                            }
                        }
                    }
                }, 500);
            });
            // 安全兜底：若某些条目异常导致未全部处理，在给定时间后强制进入导出阶段
            setTimeout(() => {
                if (processed >= items.length || !articles.length) return;
                GM_setValue('data_elsevier', JSON.stringify(articles));
                GM_setValue('task_status', 'PREPARE_DOWNLOAD');
                setProgress("");
                window.location.reload();
            }, Math.max(30000, LIMIT * 8000));
        }
    }

    function checkAndGenerate() {
        if (document.getElementById('final-btn')) return;
        const kw = GM_getValue('task_cn', "文献搜索");
        const modeNow = GM_getValue('task_mode', "both");
        const limit = GM_getValue('task_limit', 10);
        const btn = document.createElement('button');
        btn.id = 'final-btn';
        btn.innerHTML = "📑 采集任务完成 - 下载 Word 报告";
        btn.style = "position:fixed; bottom:40px; left:50%; transform:translateX(-50%); z-index:999999; padding:22px 45px; background:linear-gradient(to right, #10b981, #059669); color:white; border:none; border-radius:50px; font-weight:bold; cursor:pointer; box-shadow:0 20px 40px rgba(0,0,0,0.4); font-size:18px;";
        document.body.appendChild(btn);
        btn.onclick = () => {
            const cnki = JSON.parse(GM_getValue('data_cnki') || "[]");
            const sd = JSON.parse(GM_getValue('data_elsevier') || "[]");

            // 若两个站点均完全无结果，直接给出提示并结束本次任务
            if (!cnki.length && !sd.length) {
                alert("抱歉，该搜索词无相关论文，请重新输入");
                GM_deleteValue('task_status');
                btn.remove();
                return;
            }

            let html = `<html><head><meta charset=\"utf-8\"></head><body style=\"font-family:SimSun;\">
                <h1 style=\"text-align:center;\">三峡大学科研文献调研报告</h1>
                <p style=\"text-align:center; color:#666;\">关键词：${kw} | 生成时间：${new Date().toLocaleString()}</p><hr>`;

            // 根据模式与数据决定是否输出 CNKI 和 SD 部分
            if ((modeNow === "both" || modeNow === "cnki") && cnki.length) {
                const cnkiTitle = modeNow === "both" ? "一、 中国知网 (CNKI) 信息采集" : "中国知网 (CNKI) 信息采集";
                html += `<h2 style=\"background-color:#0075a9; color:white; padding:10px;\">${cnkiTitle}</h2>`;
            cnki.forEach((a, i) => { html += `<div style=\"margin-top:20px; border-bottom:1px dashed #ccc; padding-bottom:10px;\"><p><b>[${i+1}] ${a.title}</b></p><p style=\"font-size:13px; color:#444;\">作者: ${a.authors} | 期刊: ${a.journal} | 时间: ${a.date}</p><p style=\"font-size:13px; background:#f4f4f4; padding:10px; border-left:4px solid #0075a9;\">摘要: ${a.abs}</p><p style=\"font-size:11px; color:#0075a9;\">链接: ${a.link}</p></div>`; });
                html += `<br>`;
            }

            if ((modeNow === "both" || modeNow === "sd") && sd.length) {
                const sdTitle = modeNow === "both" ? "二、 爱思唯尔 (ScienceDirect) 信息采集" : "爱思唯尔 (ScienceDirect) 信息采集";
                html += `<h2 style=\"background-color:#ff6c00; color:white; padding:10px;\">${sdTitle}</h2>`;
                sd.forEach((a, i) => { html += `<div style=\"margin-top:20px; border-bottom:1px dashed #ccc; padding-bottom:10px;\"><p><b>[${i+1}] ${a.title}</b></p><p style=\"font-size:13px; color:#444;\">Authors: ${a.authors} | Journal: ${a.journal} | Date: ${a.date}</p><p style=\"font-size:13px; background:#fff7ed; padding:10px; border-left:4px solid #ff6c00;\">Abstract: ${a.abs}</p><p style=\"font-size:11px; color:#ff6c00;\">Link: ${a.link}</p></div>`; });
            }
            html += `</body></html>`;
            const blob = new Blob([html], {type: 'application/msword'});
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = `CTGU_科研报告_${kw}.doc`;
            link.click();
            // 若实际抓取数量少于用户指定数量，在下载后友好提示
            const msgs = [];
            if ((modeNow === "both" || modeNow === "cnki") && cnki.length && cnki.length < limit) {
                msgs.push(`知网当前仅有 ${cnki.length} 篇可用记录`);
            }
            if ((modeNow === "both" || modeNow === "sd") && sd.length && sd.length < limit) {
                msgs.push(`爱思唯尔当前仅有 ${sd.length} 篇可用记录`);
            }
            if (msgs.length) {
                alert("抱歉，本搜索词实际可用论文数量不足预期：\n" + msgs.join("\n"));
            }
            if (confirm("报告已下载！是否清理任务数据？")) { GM_deleteValue('task_status'); btn.remove(); }
        };
    }
})();
