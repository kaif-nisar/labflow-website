    (function () {
      let charts = {};

      function byId(id) { return document.getElementById(id); }

      function asCurrency(value) {
        const num = Number(value || 0);
        return `INR ${num.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
      }

      function asDate(value) {
        if (!value) return "--";
        const d = new Date(value);
        if (Number.isNaN(d.getTime())) return "--";
        return d.toLocaleString("en-IN", {
          day: "2-digit", month: "short", year: "numeric",
          hour: "2-digit", minute: "2-digit"
        });
      }

      function daysRemaining(endDateLike) {
        if (!endDateLike) return "--";
        const end = new Date(endDateLike);
        if (Number.isNaN(end.getTime())) return "--";
        return Math.max(0, Math.ceil((end.getTime() - Date.now()) / 86400000));
      }

      function normalizeText(value, fallback = "--") {
        if (value === null || value === undefined || value === "") return fallback;
        return String(value);
      }

      function hasPermission(permission, perms, isStaff) {
        if (!isStaff) return true;
        return Boolean(perms && perms[permission]);
      }

      function hasAnyPermission(rule, perms, isStaff) {
        if (!isStaff) return true;
        const tokens = String(rule || "").split(/\s+/).filter(Boolean);
        if (!tokens.length) return true;
        return tokens.some((token) => hasPermission(token, perms, isStaff));
      }

      function applyPermissionVisibility(perms, isStaff) {
        document.querySelectorAll("[data-permission]").forEach((node) => {
          const rule = node.getAttribute("data-permission");
          node.style.display = hasAnyPermission(rule, perms, isStaff) ? "" : "none";
        });
      }

      async function requestJson(path, options) {
        const res = await fetch(path, {
          credentials: "include",
          ...options,
          headers: {
            "Content-Type": "application/json",
            ...(options && options.headers ? options.headers : {})
          }
        });
        let body = null;
        try { body = await res.json(); } catch (_) { body = null; }
        return { ok: res.ok, status: res.status, data: body };
      }

      function destroyChart(key) {
        if (charts[key]) { charts[key].destroy(); charts[key] = null; }
      }

      function drawChart(key, canvasId, type, labels, data, label, color, customOptions) {
        const canvas = byId(canvasId);
        if (!canvas || typeof Chart === "undefined") return;
        destroyChart(key);

        const defaultDataset = {
          label, data,
          borderColor: color,
          backgroundColor: type === "line" ? "rgba(15,98,254,0.14)" : color,
          fill: type === "line",
          borderWidth: 2,
          tension: 0.34,
          pointRadius: type === "line" ? 2 : 0
        };

        if (type === "doughnut") {
          defaultDataset.backgroundColor = Array.isArray(color) ? color : ["#0f62fe","#14a57b","#c87c1a","#bf3d47"];
          defaultDataset.borderWidth = 1;
          defaultDataset.borderColor = "#ffffff";
          defaultDataset.hoverOffset = 4;
        }

        charts[key] = new Chart(canvas.getContext("2d"), {
          type,
          data: { labels, datasets: [defaultDataset] },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: false,
            plugins: {
              legend: { display: true, position: type === "doughnut" ? "bottom" : "top" }
            },
            scales: type === "doughnut" ? {} : {
              x: { grid: { display: false } },
              y: { grid: { color: "rgba(0,0,0,0.06)" }, beginAtZero: true }
            },
            ...(customOptions || {})
          }
        });
      }

      function setMetric(id, value) { const el = byId(id); if (el) el.textContent = value; }
      function setTrend(id, text)   { const el = byId(id); if (el) el.textContent = text; }

      function setPill(id, text, statusClass) {
        const el = byId(id);
        if (!el) return;
        el.textContent = text;
        el.className = "state-pill " + (statusClass || "na");
      }

      function statusClass(value) {
        const v = String(value || "").toLowerCase();
        if (["active","paid","captured"].includes(v)) return "active";
        if (["grace","pending","created","authorized"].includes(v)) return "grace";
        if (["expired","failed","inactive","unpaid"].includes(v)) return "expired";
        return "na";
      }

      function renderFranchiseRows(list) {
        const tbody = byId("tbody");
        if (!tbody) return;
        tbody.innerHTML = "";
        if (!Array.isArray(list) || !list.length) {
          tbody.innerHTML = '<tr><td colspan="4">No franchise data available.</td></tr>';
          return;
        }
        const frag = document.createDocumentFragment();
        list.forEach((item) => {
          const tr = document.createElement("tr");
          tr.innerHTML = `
            <td>${normalizeText(item.fullName)}</td>
            <td>${normalizeText(item.address)}</td>
            <td>${normalizeText(item.phoneNo)}<br>${normalizeText(item.email)}</td>
            <td>${item.isActive ? "Active" : "Inactive"}</td>`;
          frag.appendChild(tr);
        });
        tbody.appendChild(frag);
      }

      function renderPlansTable(payload) {
        const tbody = byId("plansTbody");
        if (!tbody) return;
        const plans = payload && Array.isArray(payload.availablePlans) ? payload.availablePlans : [];
        tbody.innerHTML = "";
        if (!plans.length) {
          tbody.innerHTML = '<tr><td colspan="6">No recharge plans available.</td></tr>';
        } else {
          const frag = document.createDocumentFragment();
          plans.forEach((plan) => {
            const tr = document.createElement("tr");
            tr.innerHTML = `
              <td>${normalizeText(plan.planType)}</td>
              <td>${normalizeText(plan.durationMonths)} month(s)</td>
              <td>${asCurrency(plan.amount)}</td>
              <td>${asCurrency(plan.baseAmount)}</td>
              <td>${asCurrency(plan.gstAmount)} (${normalizeText(plan.gstRate,"--")}%)</td>
              <td>${plan.selectable ? "Yes" : "No"}</td>`;
            frag.appendChild(tr);
          });
          tbody.appendChild(frag);
        }
        const meta = byId("plansMeta");
        if (meta) {
          meta.textContent = `Current: ${normalizeText(payload && payload.currentPlan)} | Minimum: ${normalizeText(payload && payload.minimumRechargePlan)} | Default: ${normalizeText(payload && payload.defaultSelectedPlan)}`;
        }
      }

      function renderSubscription(subscriptionPayload) {
        const sub = subscriptionPayload && subscriptionPayload.subscription ? subscriptionPayload.subscription : {};
        const status  = normalizeText(subscriptionPayload && subscriptionPayload.status, "na").toLowerCase();
        const payment = normalizeText(sub.paymentStatus, "na").toLowerCase();

        setPill("subStatusPill",  `STATUS: ${status.toUpperCase()}`,   statusClass(status));
        setPill("payStatusPill",  `PAYMENT: ${payment.toUpperCase()}`, statusClass(payment));

        setMetric("subPlanType",  normalizeText(sub.planType || sub.planDuration));
        setMetric("subPlanLayer", normalizeText(sub.planLayer));
        setMetric("subDuration",  normalizeText(sub.durationDays));
        setMetric("subPrice",     asCurrency(sub.price));
        setMetric("subStart",     asDate(sub.startDate));

        const effectiveEnd = sub.effectiveEndDate || sub.endDate;
        const remDays = daysRemaining(effectiveEnd);

        setMetric("subEnd",            asDate(sub.endDate));
        setMetric("subEffectiveEnd",   asDate(sub.effectiveEndDate));
        setMetric("subDays",           String(remDays));
        setMetric("remainingDaysTop",  remDays === "--" ? "--" : `${remDays} days`);
        setMetric("subscriptionEndTop",asDate(effectiveEnd));
        setMetric("planTypeTop",       normalizeText(sub.planType || sub.planDuration || sub.planLayer, "NA").toUpperCase());

        setTrend("trend-remainingDays", remDays === "--" ? "--" : `${remDays}d`);
        setTrend("trend-endDate",  normalizeText(subscriptionPayload && subscriptionPayload.status, "NA").toUpperCase());
        setTrend("trend-planType", normalizeText(sub.paymentStatus, "NA").toUpperCase());

        const grace = sub.gracePeriod;
        setMetric("subGrace", grace
          ? `Enabled: ${grace.isEnabled ? "Yes" : "No"}, Until: ${asDate(grace.graceUntil)}`
          : "Not configured");

        setMetric("tenantStatus", normalizeText(subscriptionPayload && subscriptionPayload.tenantStatus));
        setMetric("tenantName",   normalizeText(subscriptionPayload && subscriptionPayload.tenantName));
        setMetric("tenantCode",   normalizeText(subscriptionPayload && subscriptionPayload.tenantCode));

        const msg = byId("subMessage");
        if (msg) msg.textContent = normalizeText(subscriptionPayload && subscriptionPayload.message, "--");
      }

      function mapToSparklinePoints(values) {
        const safe = Array.isArray(values) && values.length ? values : [4,6,5,7,6,8,7];
        const min = Math.min(...safe);
        const max = Math.max(...safe);
        const range = Math.max(max - min, 1);
        const n = safe.length;
        return safe.map((v, i) => {
          const x = n === 1 ? 0 : (i * 120) / (n - 1);
          const y = 24 - ((v - min) / range) * 18;
          return `${x.toFixed(1)},${y.toFixed(1)}`;
        }).join(" ");
      }

      function setSparkline(svgId, values) {
        const svg = byId(svgId);
        if (!svg) return;
        const poly = svg.querySelector("polyline");
        if (!poly) return;
        poly.setAttribute("points", mapToSparklinePoints(values));
      }

      function renderOperationalData(dashboardPayload, contextUser) {
        const stats      = (dashboardPayload && dashboardPayload.stats)  || {};
        const chartsData = (dashboardPayload && dashboardPayload.charts) || {};
        const filterMeta = (dashboardPayload && dashboardPayload.filter) || {};

        setMetric("totalBookings",    normalizeText(stats.totalBookings, "0"));
        setMetric("totalRevenue",     asCurrency(stats.totalRevenue || 0));
        setMetric("pendingTests",     normalizeText(stats.pendingTests, "0"));
        setMetric("activeFranchises", normalizeText(stats.activeFranchises, "0"));

        const monthly     = chartsData.monthlyRevenue || { labels: [], data: [] };
        const daily       = chartsData.dailyRevenue   || { labels: [], data: [] };
        const tests       = chartsData.topTests       || { labels: [], data: [] };
        const monthlyData = Array.isArray(monthly.data) ? monthly.data : [];
        const dailyData   = Array.isArray(daily.data)   ? daily.data   : [];

        const lastMonthly     = monthlyData.length ? monthlyData[monthlyData.length - 1] : 0;
        const previousMonthly = monthlyData.length > 1 ? monthlyData[monthlyData.length - 2] : lastMonthly;
        const delta = previousMonthly ? Math.round(((lastMonthly - previousMonthly) / previousMonthly) * 100) : 0;

        setTrend("trend-totalBookings", `${normalizeText(stats.pendingTests, 0)} pending`);
        setTrend("trend-totalRevenue",  `${delta >= 0 ? "+" : ""}${delta}%`);
        setTrend("trend-pendingTests",  `${normalizeText(stats.pendingTests, 0)} open`);

        setSparkline("spark-totalBookings", dailyData.slice(-8));
        setSparkline("spark-totalRevenue",  monthlyData.slice(-8));
        setSparkline("spark-remainingDays", tests.data || []);
        setSparkline("spark-pendingTests",  dailyData.slice(-8).map((v) => Math.max(1, Math.round(v / 1000))));
        setSparkline("spark-endDate",       monthlyData.slice(-8).map((v) => Math.max(1, Math.round(v / 1000))));
        setSparkline("spark-planType",      monthlyData.slice(-8).map((v, i) => Math.max(1, Math.round((v / 2000) + i))));

        drawChart("monthlyRevenue", "revenueChart", "line",
          Array.isArray(monthly.labels) ? monthly.labels : [], monthlyData, "Monthly Revenue", "#0f62fe");

        const isHourly = daily.mode === "hourly";
        const dailyChartLabel = isHourly ? "Hourly Revenue (Today - Realtime)" : "Daily Revenue";
        const dailyChartColor = isHourly ? "#0f62fe" : "#14a57b";

        drawChart("dailyRevenue", "samplesChart", "line",
          Array.isArray(daily.labels) ? daily.labels : [], dailyData, dailyChartLabel, dailyChartColor);

        drawChart("topTests", "testCategoriesChart", "doughnut",
          Array.isArray(tests.labels) ? tests.labels : [],
          Array.isArray(tests.data)   ? tests.data   : [],
          "Top Tests",
          ["#5a66f3","#13ad7f","#f0a43d","#e65b74","#9333ea","#ec4899"],
          {
            cutout: "52%",
            layout: { padding: 6 },
            plugins: {
              legend: { display: true, position: "bottom",
                labels: { boxWidth: 10, usePointStyle: true } }
            }
          }
        );

        renderFranchiseRows(dashboardPayload && dashboardPayload.franchisees);
        renderRecentBookings(dashboardPayload && dashboardPayload.recentBookings);
      }

      function renderRecentBookings(list) {
        const tbody = byId("recentBookingsTbody");
        const countBadge = byId("recentBookingsCount");
        if (!tbody) return;
        tbody.innerHTML = "";
        if (!Array.isArray(list) || !list.length) {
          tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: var(--muted); padding: 16px;">No bookings found in this range for this tenant.</td></tr>';
          if (countBadge) countBadge.textContent = "0 Bookings";
          return;
        }
        if (countBadge) countBadge.textContent = `${list.length} Recent`;
        const frag = document.createDocumentFragment();
        list.forEach((item) => {
          const tr = document.createElement("tr");
          const s = normalizeText(item.status, "Pending");
          const pillClass = statusClass(s);
          tr.innerHTML = `
            <td style="font-weight: 700; color: #0f62fe;">${normalizeText(item.bookingId)}</td>
            <td>${normalizeText(item.patientName)}</td>
            <td>${normalizeText(item.patientPhone)}</td>
            <td style="font-weight: 700;">${asCurrency(item.total)}</td>
            <td><span class="state-pill ${pillClass}" style="padding: 3px 8px; font-size: 10px;">${s}</span></td>
            <td style="color: var(--muted); font-size: 11px;">${asDate(item.createdAt)}</td>
          `;
          frag.appendChild(tr);
        });
        tbody.appendChild(frag);
      }

      const API_BASE = (typeof BASE_URL !== "undefined" && BASE_URL)
        ? BASE_URL
        : (window.BASE_URL || window.location.origin || "");

      function formatDateToInput(d) {
        if (!d || Number.isNaN(d.getTime())) return "";
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, "0");
        const day = String(d.getDate()).padStart(2, "0");
        return `${year}-${month}-${day}`;
      }

      async function loadOperationalData(customOptions = {}) {
        const loader = byId("filterLoadingIndicator");
        if (loader) loader.style.display = "inline-flex";

        const presetSelect = byId("dashPresetSelect");
        const startInput   = byId("dashStartDate");
        const endInput     = byId("dashEndDate");
        const activeFilterBadgeText = byId("activeFilterText");

        const preset = customOptions.preset || (presetSelect ? presetSelect.value : "one_month");

        const now = new Date();
        let start = null;
        let end = now;
        let isToday = false;

        if (customOptions.startDate && customOptions.endDate) {
          start = new Date(customOptions.startDate);
          end   = new Date(customOptions.endDate);
        } else if (preset === "custom" && startInput && endInput && startInput.value && endInput.value) {
          start = new Date(startInput.value + "T00:00:00");
          const isEndToday = endInput.value === formatDateToInput(now);
          end = isEndToday ? now : new Date(endInput.value + "T23:59:59.999");
        } else if (preset === "today") {
          isToday = true;
          // Exact realtime Today: start of today 00:00:00.000 local time to current exact millisecond `now`
          start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
          end = now;
        } else if (preset === "yesterday") {
          start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 0, 0, 0, 0);
          end = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 23, 59, 59, 999);
        } else if (preset === "last_7_days" || preset === "7_days") {
          start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          end = now;
        } else {
          switch (preset) {
            case "one_month": {
              const d = new Date(now);
              d.setMonth(d.getMonth() - 1);
              start = d;
              break;
            }
            case "six_month": {
              const d = new Date(now);
              d.setMonth(d.getMonth() - 6);
              start = d;
              break;
            }
            case "one_year": {
              const d = new Date(now);
              d.setFullYear(d.getFullYear() - 1);
              start = d;
              break;
            }
            case "five_year": {
              const d = new Date(now);
              d.setFullYear(d.getFullYear() - 5);
              start = d;
              break;
            }
            case "all_time": {
              start = null;
              break;
            }
            default: {
              const d = new Date(now);
              d.setMonth(d.getMonth() - 1);
              start = d;
            }
          }
        }

        // Sync date pickers in UI
        if (startInput) startInput.value = start ? formatDateToInput(start) : "";
        if (endInput)   endInput.value   = formatDateToInput(end);

        const queryParams = new URLSearchParams();
        queryParams.set("range", preset);
        if (start) {
          queryParams.set("startDate", start.toISOString());
        }
        queryParams.set("endDate", end.toISOString());
        queryParams.set("timezone", Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Kolkata");

        // UI status badge text
        const exactTimeStr = now.toLocaleTimeString("en-IN", {
          hour: "2-digit", minute: "2-digit", second: "2-digit"
        });

        if (activeFilterBadgeText) {
          if (isToday) {
            activeFilterBadgeText.textContent = `Today (Live: ${exactTimeStr})`;
          } else if (preset === "yesterday") {
            activeFilterBadgeText.textContent = `Yesterday (${formatDateToInput(start)})`;
          } else if (preset === "custom") {
            activeFilterBadgeText.textContent = `${formatDateToInput(start)} → ${formatDateToInput(end)}`;
          } else if (preset === "all_time") {
            activeFilterBadgeText.textContent = `All Time (Till ${exactTimeStr})`;
          } else {
            const labelMap = {
              last_7_days: "Last 7 Days",
              one_month: "One Month",
              six_month: "Six Month",
              one_year: "One Year",
              five_year: "Five Year"
            };
            activeFilterBadgeText.textContent = `${labelMap[preset] || preset} (${exactTimeStr})`;
          }
        }

        try {
          const opsResult = await requestJson(`${API_BASE}/api/v1/user/get-booking-for-dashboard?${queryParams.toString()}`);
          if (opsResult.ok && opsResult.data) {
            renderOperationalData(opsResult.data, window.user || {});
          }
        } catch (err) {
          console.error("Failed to load dashboard operational data:", err);
        } finally {
          if (loader) loader.style.display = "none";
          const stamp = byId("dashLastUpdated");
          if (stamp) stamp.textContent = `Last sync: ${now.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}`;
        }
      }

      function setupFilterListeners() {
        const presetSelect = byId("dashPresetSelect");
        const startInput   = byId("dashStartDate");
        const endInput     = byId("dashEndDate");
        const applyBtn     = byId("dashApplyBtn");
        const todayBtn     = byId("dashTodayBtn");
        const refreshBtn   = byId("dashRefreshBtn");

        if (presetSelect) {
          presetSelect.addEventListener("change", () => {
            const val = presetSelect.value;
            if (val === "custom") {
              if (startInput) startInput.focus();
              return;
            }
            loadOperationalData({ preset: val });
          });
        }

        function onDateChange() {
          if (presetSelect) presetSelect.value = "custom";
          if (startInput && endInput && startInput.value && endInput.value) {
            loadOperationalData({ preset: "custom" });
          }
        }

        if (startInput) startInput.addEventListener("change", onDateChange);
        if (endInput)   endInput.addEventListener("change", onDateChange);

        if (applyBtn) {
          applyBtn.addEventListener("click", () => {
            const preset = presetSelect ? presetSelect.value : "one_month";
            loadOperationalData({ preset });
          });
        }

        if (todayBtn) {
          todayBtn.addEventListener("click", () => {
            if (presetSelect) presetSelect.value = "today";
            loadOperationalData({ preset: "today" });
          });
        }

        if (refreshBtn) {
          refreshBtn.addEventListener("click", () => {
            const preset = presetSelect ? presetSelect.value : "one_month";
            loadOperationalData({ preset });
          });
        }
      }

      async function initDashboard() {
        const contextUser = window.user || {};
        const permissions = contextUser.permissions || {};
        const isStaff     = contextUser.role === "staff";

        applyPermissionVisibility(permissions, isStaff);

        const subtitle = byId("dashSubtitle");
        if (subtitle) {
          subtitle.textContent = `Welcome ${normalizeText(contextUser.fullName, "User")}. Tenant operations and subscription health in one view.`;
        }

        setupFilterListeners();

        // 1. Initial fetch for subscription & recharge plans
        const [subResult, rechargeResult] = await Promise.allSettled([
          requestJson(`${API_BASE}/api/v1/user/check-subscription`, { method: "POST" }),
          requestJson(`${API_BASE}/api/v1/user/recharge-options`,   { method: "GET"  })
        ]);

        const sub     = subResult.status     === "fulfilled" ? subResult.value     : { ok: false, data: null };
        const recharge= rechargeResult.status=== "fulfilled" ? rechargeResult.value: { ok: false, data: null };

        requestAnimationFrame(() => {
          if (sub.ok     && sub.data)     renderSubscription(sub.data);
          if (recharge.ok&& recharge.data)renderPlansTable(recharge.data);
        });

        // 2. Fetch tenant operational data with default 1 month
        await loadOperationalData({ preset: "one_month", days: 30 });
      }

      if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initDashboard, { once: true });
      } else {
        initDashboard();
      }
    })();
