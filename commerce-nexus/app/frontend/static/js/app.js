/* ==========================================================================
   Veridata Commerce Nexus - Modern Frontend Application Script
   ========================================================================== */

const App = (function () {
  // Application State
  const state = {
    apiKey: localStorage.getItem("veridata_api_key") || "demo-acme-api-key",
    adminKey: localStorage.getItem("veridata_admin_key") || "change-me-admin-key",
    theme: localStorage.getItem("veridata_theme") || "dark",
    activeTab: "overview",
    customers: [],
    products: [],
    orders: [],
    events: [],
    tenants: [],
    cachedProducts: [],
    orderWizardItems: [],
    sandboxKey: "",
    prismaticInitialized: false,
    prismaticOrigin: null,
  };

  // API Wrapper
  async function apiFetch(endpoint, options = {}) {
    const headers = {
      "Content-Type": "application/json",
      "X-API-Key": options.useAdmin ? state.adminKey : state.apiKey,
      ...(options.idempotencyKey ? { "Idempotency-Key": options.idempotencyKey } : {}),
      ...options.headers,
    };

    try {
      const response = await fetch(endpoint, {
        method: options.method || "GET",
        headers,
        body: options.body ? JSON.stringify(options.body) : undefined,
      });

      const text = await response.text();
      let data = {};
      try {
        data = text ? JSON.parse(text) : {};
      } catch (e) {
        data = { raw: text };
      }

      if (!response.ok) {
        const errMsg = data.error?.message || data.detail || `HTTP ${response.status}`;
        if (response.status === 401 && !options.suppress401Toast) {
          showToast(`Invalid X-API-Key or unseeded database. Click "🌱 Seed DB" to initialize tenants.`, "warning");
        }
        throw new Error(errMsg);
      }

      return { status: response.status, data };
    } catch (err) {
      console.error(`[API Error] ${endpoint}:`, err);
      throw err;
    }
  }

  // Seed Database Helper
  async function seedDatabase() {
    try {
      showToast("Seeding demo tenants and initial data...", "info");
      const res = await apiFetch("/seed", { method: "POST", suppress401Toast: true });
      showToast("Database seeded successfully! Demo records created.", "success");
      refreshCurrentTab();
    } catch (err) {
      showToast("Seeding result: " + err.message, "info");
      refreshCurrentTab();
    }
  }

  // Toast Notification Helper
  function showToast(message, type = "info") {
    const container = document.getElementById("toast-container");
    if (!container) return;
    const toast = document.createElement("div");
    toast.className = `toast ${type}`;
    const iconMap = { success: "✅", error: "❌", warning: "⚠️", info: "ℹ️" };
    toast.innerHTML = `<span>${iconMap[type] || "ℹ️"}</span> <span>${message}</span>`;
    container.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = "0";
      toast.style.transform = "translateX(100%)";
      setTimeout(() => toast.remove(), 300);
    }, 4000);
  }

  // Copy to Clipboard & Copyable ID Helper
  async function copyToClipboard(text, label = "ID") {
    if (!text) return;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = text;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
      }
      showToast(`Copied ${label} to clipboard!`, "success");
    } catch (err) {
      showToast(`Failed to copy: ${err.message}`, "error");
    }
  }

  function renderCopyableId(id, label = "ID", len = 8) {
    if (!id) return "-";
    const display = id.length > len ? `${id.substring(0, len)}...` : id;
    return `<span class="copyable-id" onclick="App.copyToClipboard('${id}', '${label}')" title="Click to copy full ID (${id})"><code class="mono">${display}</code> <span class="copy-icon">📋</span></span>`;
  }

  // Health Check
  async function checkHealth() {
    const badge = document.getElementById("health-status-badge");
    try {
      const res = await apiFetch("/health");
      if (res.data.status === "ok") {
        badge.innerHTML = `<span class="status-dot online"></span><span class="status-label">API Connected</span>`;
      } else {
        badge.innerHTML = `<span class="status-dot"></span><span class="status-label">API Offline</span>`;
      }
    } catch (e) {
      badge.innerHTML = `<span class="status-dot"></span><span class="status-label">API Error</span>`;
    }
  }

  // Init & Setup
  function init() {
    applyTheme(state.theme);
    setupTenantSelector();
    setupNavigation();
    setupPrismaticEvents();
    updateOdooButton();
    checkHealth();
    generateNewSandboxKey();
    switchTab("overview");
  }

  function applyTheme(theme) {
    state.theme = theme;
    localStorage.setItem("veridata_theme", theme);
    document.documentElement.setAttribute("data-theme", theme);
    const icon = document.getElementById("theme-icon");
    const label = document.getElementById("theme-label");
    if (icon) icon.textContent = theme === "light" ? "🌙" : "☀️";
    if (label) label.textContent = theme === "light" ? "Dark" : "Light";
  }

  function toggleTheme() {
    const nextTheme = state.theme === "light" ? "dark" : "light";
    applyTheme(nextTheme);
    showToast(`Switched to ${nextTheme} mode`, "info");
  }

  // Tenant Selector Handler
  function setupTenantSelector() {
    const select = document.getElementById("tenant-select");
    const displayKey = document.getElementById("active-key-display");

    if (state.apiKey === "demo-acme-api-key") select.value = "demo-acme-api-key";
    else if (state.apiKey === "demo-globex-api-key") select.value = "demo-globex-api-key";
    else select.value = "custom";

    displayKey.textContent = state.apiKey;

    select.addEventListener("change", (e) => {
      const val = e.target.value;
      if (val === "custom") {
        promptApiKey();
      } else {
        setApiKey(val);
      }
    });
  }

  function promptApiKey() {
    const input = prompt("Enter tenant X-API-Key:", state.apiKey);
    if (input && input.trim()) {
      setApiKey(input.trim());
    }
  }

  function setApiKey(key) {
    state.apiKey = key;
    localStorage.setItem("veridata_api_key", key);
    document.getElementById("active-key-display").textContent = key;
    updateOdooButton();
    showToast(`Switched active API key: ${key.substring(0, 12)}...`, "info");
    refreshCurrentTab();
  }

  // Embedded Prismatic Odoo configuration
  function odooConnectionStorageKey() {
    return `veridata_odoo_connected:${state.apiKey}`;
  }

  function updateOdooButton(isLoading = false) {
    const connected = localStorage.getItem(odooConnectionStorageKey()) === "true";
    const buttons = document.querySelectorAll(".btn-odoo");
    buttons.forEach((button) => {
      button.disabled = isLoading;
      button.classList.toggle("connected", connected);
      const labelSpan = button.querySelector("#connect-odoo-label") || button.querySelector(".connect-odoo-label");
      const text = isLoading ? "Opening Odoo..." : connected ? "Manage Odoo" : "Connect Odoo";
      if (labelSpan) {
        labelSpan.textContent = text;
      } else {
        button.innerHTML = `<span class="odoo-button-mark" aria-hidden="true">O</span> ${text}`;
      }
    });
  }

  function setupPrismaticEvents() {
    window.addEventListener("message", (message) => {
      if (state.prismaticOrigin && message.origin !== state.prismaticOrigin) return;

      const eventName = message.data?.event;
      if (eventName === "INSTANCE_DEPLOYED") {
        localStorage.setItem(odooConnectionStorageKey(), "true");
        updateOdooButton();
        showToast("Odoo is connected and the integration is active.", "success");
      } else if (eventName === "INSTANCE_DELETED") {
        localStorage.removeItem(odooConnectionStorageKey());
        updateOdooButton();
        showToast("The Odoo integration was disconnected.", "info");
      } else if (
        eventName === "INSTANCE_CONFIGURATION_CLOSED" ||
        eventName === "POPOVER_CLOSED"
      ) {
        updateOdooButton();
      }
    });
  }

  async function connectOdoo() {
    if (!window.prismatic) {
      showToast("The Prismatic configuration client could not be loaded.", "error");
      return;
    }

    updateOdooButton(true);
    try {
      const response = await apiFetch("/integrations/prismatic/embedded-token", {
        method: "POST",
      });
      const config = response.data;
      state.prismaticOrigin = new URL(config.prismatic_url).origin;

      if (!state.prismaticInitialized) {
        window.prismatic.init({
          prismaticUrl: config.prismatic_url,
          screenConfiguration: {
            instance: {
              hideBackToMarketplace: true,
              hideTabs: ["Test", "Executions", "Monitors", "Logs"],
            },
            configurationWizard: {
              mode: "streamlined",
              connectionConfiguration: "inline",
              triggerDetailsConfiguration: "default-open",
            },
          },
        });
        state.prismaticInitialized = true;
      }

      await window.prismatic.authenticate({ token: config.token });
      window.prismatic.configureInstance({
        integrationName: config.integration_name,
        skipRedirectOnRemove: true,
        usePopover: true,
        theme: state.theme === "light" ? "LIGHT" : "DARK",
      });
    } catch (err) {
      console.error("Unable to open Odoo configuration:", err);
      showToast(`Unable to open Odoo configuration: ${err.message}`, "error");
      updateOdooButton();
    }
  }

  // Navigation
  function setupNavigation() {
    document.querySelectorAll(".nav-tab").forEach((btn) => {
      btn.addEventListener("click", () => {
        const targetTab = btn.getAttribute("data-tab");
        switchTab(targetTab);
      });
    });
  }

  function switchTab(tabId) {
    state.activeTab = tabId;
    document.querySelectorAll(".nav-tab").forEach((b) => {
      b.classList.toggle("active", b.getAttribute("data-tab") === tabId);
    });
    document.querySelectorAll(".tab-panel").forEach((p) => {
      p.classList.toggle("active", p.id === `tab-${tabId}`);
    });
    refreshCurrentTab();
  }

  function refreshCurrentTab() {
    switch (state.activeTab) {
      case "overview":
        refreshOverview();
        break;
      case "customers":
        loadCustomers();
        break;
      case "products":
        loadProducts();
        break;
      case "orders":
        loadOrders();
        break;
      case "events":
        loadEvents();
        updateWebhookFormFields();
        break;
      case "settings":
        loadPrismaticSettings();
        generateNewSandboxKey();
        break;
    }
  }

  // 1. RECENT ACTIVITY TAB
  async function refreshOverview() {
    return loadOverview();
  }

  async function loadOverview() {
    try {
      const statusFilter = document.getElementById("activity-filter-status")?.value || "";
      const entityFilter = document.getElementById("activity-filter-entity")?.value || "";

      let queryParams = "?page_size=30";
      if (statusFilter) queryParams += `&status=${encodeURIComponent(statusFilter)}`;
      if (entityFilter) queryParams += `&entity_type=${encodeURIComponent(entityFilter)}`;

      const res = await apiFetch(`/integration-events${queryParams}`);
      const events = res.data.items || [];
      state.overviewEvents = events;

      // Update pill statistics
      updateActivityStats(events, res.data.total);

      // Render rich cards
      renderOverviewActivity(events);
    } catch (e) {
      showToast("Error loading recent integration activity. Check API Key.", "error");
    }
  }

  function updateActivityStats(events, total) {
    const elTotal = document.getElementById("stat-events-total");
    const elProcessed = document.getElementById("stat-events-processed");
    const elPending = document.getElementById("stat-events-pending");
    const elFailed = document.getElementById("stat-events-failed");

    if (elTotal) elTotal.textContent = `${total !== undefined ? total : events.length} Events`;

    const processedCount = events.filter((e) => e.status === "processed" || e.status === "success").length;
    const pendingCount = events.filter((e) => e.status === "pending" || e.status === "dispatched").length;
    const failedCount = events.filter((e) => e.status === "failed").length;

    if (elProcessed) elProcessed.textContent = `${processedCount} Processed`;
    if (elPending) elPending.textContent = `${pendingCount} Pending`;

    if (elFailed) {
      if (failedCount > 0) {
        elFailed.style.display = "inline-flex";
        elFailed.textContent = `${failedCount} Failed`;
      } else {
        elFailed.style.display = "none";
      }
    }
  }

  function getEventIcon(eventType, entityType) {
    if (!eventType) return "⚡";
    if (eventType.includes("customer")) return "👥";
    if (eventType.includes("product")) return "📦";
    if (eventType.includes("order")) return "🛒";
    if (eventType.includes("webhook")) return "⚡";
    if (entityType === "customer") return "👥";
    if (entityType === "product") return "📦";
    if (entityType === "order") return "🛒";
    return "⚡";
  }

  function formatEventDetails(ev) {
    const payload = ev.payload || {};
    const parts = [];

    if (ev.entity_type === "customer") {
      if (payload.name) parts.push(`Customer: <strong>${escapeHtml(payload.name)}</strong>`);
      if (payload.email) parts.push(`<span class="text-dim">(${escapeHtml(payload.email)})</span>`);
      if (payload.external_id) parts.push(`<span class="badge badge-outline">Odoo Partner ID: ${escapeHtml(payload.external_id)}</span>`);
    } else if (ev.entity_type === "product") {
      if (payload.name) parts.push(`Product: <strong>${escapeHtml(payload.name)}</strong>`);
      if (payload.sku) parts.push(`<span class="mono text-dim">SKU: ${escapeHtml(payload.sku)}</span>`);
      if (payload.price !== undefined) parts.push(`<span class="text-success">$${Number(payload.price).toFixed(2)}</span>`);
      if (payload.external_id) parts.push(`<span class="badge badge-outline">Odoo Product ID: ${escapeHtml(payload.external_id)}</span>`);
    } else if (ev.entity_type === "order") {
      if (payload.customer_name) parts.push(`Customer: <strong>${escapeHtml(payload.customer_name)}</strong>`);
      if (payload.total_amount !== undefined) parts.push(`Amount: <strong class="text-success">$${Number(payload.total_amount).toFixed(2)}</strong>`);
      if (payload.external_id) parts.push(`<span class="badge badge-outline">Odoo Order ID: ${escapeHtml(payload.external_id)}</span>`);
      if (payload.status) parts.push(`<span class="text-dim">Status: ${escapeHtml(payload.status)}</span>`);
    } else {
      const keys = Object.keys(payload).slice(0, 3);
      if (keys.length > 0) {
        const preview = keys.map((k) => `${k}: ${payload[k]}`).join(" • ");
        parts.push(`<span class="text-dim">${escapeHtml(preview)}</span>`);
      }
    }

    return parts.length > 0 ? parts.join(" &bull; ") : "<span class=\"text-dim\">No payload metadata</span>";
  }

  function renderOverviewActivity(events) {
    const tbody = document.getElementById("overview-activity-list");
    if (!tbody) return;

    if (!events || events.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="5" class="text-center" style="padding: 2.5rem 1rem;">
            <span style="font-size: 2rem; display: block; margin-bottom: 0.5rem;">🔍</span>
            <span style="color: var(--text-muted); font-size: 0.875rem;">No matching integration events found.</span>
          </td>
        </tr>`;
      return;
    }

    tbody.innerHTML = events
      .map((ev) => {
        const icon = getEventIcon(ev.event_type, ev.entity_type);
        const formattedDate = new Date(ev.created_at).toLocaleString([], {
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        });
        const detailsHtml = formatEventDetails(ev);
        const hasError = Boolean(ev.last_error);

        return `
          <tr class="${hasError ? "row-has-error" : ""}">
            <td style="overflow: hidden;">
              <div style="display: flex; align-items: flex-start; gap: 0.65rem;">
                <span class="activity-type-icon-sm">${icon}</span>
                <div style="flex: 1; min-width: 0;">
                  <div style="display: flex; align-items: center; gap: 0.4rem; margin-bottom: 0.2rem; flex-wrap: wrap;">
                    <span class="activity-type-title-sm">${escapeHtml(ev.event_type)}</span>
                    <span class="badge badge-sm badge-${getEventStatusBadge(ev.status)}">${ev.status}</span>
                    <button class="btn btn-xs btn-secondary" onclick="App.viewOverviewEventJson('${ev.id}')" title="View Payload JSON" style="padding: 0.15rem 0.45rem; font-size: 0.72rem;">
                      🔍 View Payload
                    </button>
                    ${ev.retry_count > 0 ? `<span class="badge badge-warning badge-sm">Retried ${ev.retry_count}x</span>` : ""}
                  </div>
                  <div class="activity-payload-preview-sm" style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${detailsHtml}</div>
                  ${hasError ? `<div class="activity-error-inline">⚠️ ${escapeHtml(ev.last_error)}</div>` : ""}
                </div>
              </div>
            </td>
            <td class="text-dim" style="white-space: nowrap; font-size: 0.8125rem;">
              ${formattedDate}
            </td>
            <td style="white-space: nowrap;">
              ${renderCopyableId(ev.id, "Event ID")}
            </td>
            <td style="white-space: nowrap;">
              ${renderCopyableId(ev.entity_id, "Entity ID")}
            </td>
            <td style="text-align: right; white-space: nowrap;">
              <div style="display: inline-flex; gap: 0.35rem; align-items: center; justify-content: flex-end;">
                <button class="btn btn-xs btn-secondary" onclick="App.viewOverviewEventJson('${ev.id}')" title="View Payload JSON">
                  🔍 View Payload
                </button>
                ${
                  ev.status === "failed" || ev.status === "pending"
                    ? `<button class="btn btn-xs btn-primary" onclick="App.retryOverviewEvent('${ev.id}')" title="Retry Event Delivery">🔄 Retry</button>`
                    : ""
                }
              </div>
            </td>
          </tr>
        `;
      })
      .join("");
  }

  function viewOverviewEventJson(id) {
    const ev = (state.overviewEvents || []).find((e) => e.id === id) || (state.events || []).find((e) => e.id === id);
    if (!ev) return;
    document.getElementById("event-json-title").textContent = `Event Payload: ${ev.event_type} (${ev.id.substring(0, 8)}...)`;
    document.getElementById("event-json-code").textContent = JSON.stringify(ev.payload || ev, null, 2);
    document.getElementById("modal-event-json").showModal();
  }

  async function retryOverviewEvent(id) {
    try {
      const res = await apiFetch(`/integration-events/${id}/retry`, { method: "POST" });
      showToast(`Event re-queued for processing. Status: '${res.data.status}'.`, "success");
      loadOverview();
    } catch (err) {
      showToast("Error retrying event: " + err.message, "error");
    }
  }

  function getEventStatusBadge(status) {
    if (status === "processed" || status === "success") return "success";
    if (status === "pending") return "warning";
    if (status === "dispatched") return "info";
    if (status === "failed") return "danger";
    return "neutral";
  }

  // 2. CUSTOMERS TAB
  async function loadCustomers() {
    const search = document.getElementById("customer-search")?.value || "";
    const syncStatus = document.getElementById("customer-sync-filter")?.value || "";
    const tbody = document.getElementById("customers-table-body");

    tbody.innerHTML = `<tr><td colspan="8" class="text-center">Loading customers...</td></tr>`;

    let url = `/customers?page_size=50`;
    if (search) url += `&search=${encodeURIComponent(search)}`;
    if (syncStatus) url += `&sync_status=${encodeURIComponent(syncStatus)}`;

    try {
      const res = await apiFetch(url);
      state.customers = res.data.items || [];
      renderCustomersTable(state.customers, res.data.total);
    } catch (err) {
      tbody.innerHTML = `<tr><td colspan="8" class="text-center text-danger">Failed to load customers: ${err.message}</td></tr>`;
    }
  }

  function renderCustomersTable(customers, total) {
    const tbody = document.getElementById("customers-table-body");
    if (customers.length === 0) {
      tbody.innerHTML = `<tr><td colspan="8" class="text-center">No customers found.</td></tr>`;
      return;
    }

    tbody.innerHTML = customers
      .map(
        (c) => `
      <tr>
        <td>${renderCopyableId(c.id, "Customer ID")}</td>
        <td><strong>${escapeHtml(c.name)}</strong></td>
        <td>${escapeHtml(c.email)}</td>
        <td>${escapeHtml(c.phone || "-")}</td>
        <td>${c.external_id ? renderCopyableId(c.external_id, "Odoo ID", 15) : '<code class="mono"><em>Unassigned</em></code>'}</td>
        <td><span class="badge badge-${getEventStatusBadge(c.sync_status)}">${c.sync_status}</span></td>
        <td>${new Date(c.updated_at).toLocaleDateString()}</td>
        <td>
          <button class="btn btn-sm btn-ghost" onclick="App.editCustomer('${c.id}')">✏️ Edit</button>
          <button class="btn btn-sm btn-ghost-danger" onclick="App.deleteCustomer('${c.id}')">🗑️ Delete</button>
        </td>
      </tr>
    `
      )
      .join("");

    document.getElementById("customers-pagination").textContent = `Showing ${customers.length} of ${total} records`;
  }

  function openCustomerModal(cust = null) {
    document.getElementById("form-customer").reset();
    document.getElementById("cust-id").value = cust ? cust.id : "";
    document.getElementById("cust-name").value = cust ? cust.name : "";
    document.getElementById("cust-email").value = cust ? cust.email : "";
    document.getElementById("cust-phone").value = cust ? cust.phone || "" : "";
    document.getElementById("cust-external-id").value = cust ? cust.external_id || "" : "";

    const idContainer = document.getElementById("cust-id-container");
    const idDisplay = document.getElementById("cust-id-display");
    if (cust && idContainer && idDisplay) {
      idContainer.style.display = "block";
      idDisplay.value = cust.id;
    } else if (idContainer) {
      idContainer.style.display = "none";
    }

    document.getElementById("modal-customer-title").textContent = cust ? "Edit Customer" : "Add New Customer";
    document.getElementById("modal-customer").showModal();
  }

  function editCustomer(id) {
    const cust = state.customers.find((c) => c.id === id);
    if (cust) openCustomerModal(cust);
  }

  async function saveCustomer(e) {
    e.preventDefault();
    const id = document.getElementById("cust-id").value;
    const body = {
      name: document.getElementById("cust-name").value,
      email: document.getElementById("cust-email").value,
      phone: document.getElementById("cust-phone").value || null,
      external_id: document.getElementById("cust-external-id").value || null,
    };

    try {
      if (id) {
        await apiFetch(`/customers/${id}`, { method: "PUT", body });
        showToast("Customer updated successfully! Integration event queued.", "success");
      } else {
        await apiFetch(`/customers`, { method: "POST", body });
        showToast("Customer created successfully! customer.created event generated.", "success");
      }
      closeModal("modal-customer");
      loadCustomers();
    } catch (err) {
      showToast(`Error saving customer: ${err.message}`, "error");
    }
  }

  async function deleteCustomer(id) {
    const cust = state.customers.find((c) => c.id === id);
    const name = cust ? cust.name : "customer";
    if (!confirm(`Are you sure you want to delete customer '${name}'?`)) return;
    try {
      await apiFetch(`/customers/${id}`, { method: "DELETE" });
      showToast(`Customer '${name}' deleted successfully! customer.deleted event emitted.`, "success");
      loadCustomers();
    } catch (err) {
      showToast(`Error deleting customer: ${err.message}`, "error");
    }
  }

  // 3. PRODUCTS TAB
  async function loadProducts() {
    const search = document.getElementById("product-search")?.value || "";
    const inStock = document.getElementById("product-stock-filter")?.value || "";
    const syncStatus = document.getElementById("product-sync-filter")?.value || "";
    const tbody = document.getElementById("products-table-body");

    tbody.innerHTML = `<tr><td colspan="8" class="text-center">Loading products...</td></tr>`;

    let url = `/products?page_size=50`;
    if (search) url += `&search=${encodeURIComponent(search)}`;
    if (inStock !== "") url += `&in_stock=${inStock}`;
    if (syncStatus) url += `&sync_status=${encodeURIComponent(syncStatus)}`;

    try {
      const res = await apiFetch(url);
      state.products = res.data.items || [];
      state.cachedProducts = state.products;
      renderProductsTable(state.products, res.data.total);
    } catch (err) {
      tbody.innerHTML = `<tr><td colspan="8" class="text-center text-danger">Failed to load products: ${err.message}</td></tr>`;
    }
  }

  function renderProductsTable(products, total) {
    const tbody = document.getElementById("products-table-body");
    if (products.length === 0) {
      tbody.innerHTML = `<tr><td colspan="8" class="text-center">No products found.</td></tr>`;
      return;
    }

    tbody.innerHTML = products
      .map((p) => {
        const stockBadge = p.stock_quantity > 0 ? "badge-success" : "badge-danger";
        return `
        <tr>
          <td><code class="mono">${escapeHtml(p.sku)}</code></td>
          <td><strong>${escapeHtml(p.name)}</strong></td>
          <td>$${parseFloat(p.price).toFixed(2)}</td>
          <td><span class="badge ${stockBadge}">${p.stock_quantity} units</span></td>
          <td><code class="mono">${p.external_id || "<em>Unassigned</em>"}</code></td>
          <td><span class="badge badge-${getEventStatusBadge(p.sync_status)}">${p.sync_status}</span></td>
          <td>${new Date(p.updated_at).toLocaleDateString()}</td>
          <td>
            <button class="btn btn-sm btn-ghost" onclick="App.editProduct('${p.id}')">✏️ Edit</button>
            <button class="btn btn-sm btn-ghost-danger" onclick="App.deleteProduct('${p.id}')">🗑️ Delete</button>
          </td>
        </tr>
      `;
      })
      .join("");

    document.getElementById("products-pagination").textContent = `Showing ${products.length} of ${total} records`;
  }

  function openProductModal(prod = null) {
    document.getElementById("form-product").reset();
    document.getElementById("prod-id").value = prod ? prod.id : "";
    document.getElementById("prod-sku").value = prod ? prod.sku : "";
    document.getElementById("prod-name").value = prod ? prod.name : "";
    document.getElementById("prod-price").value = prod ? prod.price : "";
    document.getElementById("prod-stock").value = prod ? prod.stock_quantity : "";
    document.getElementById("prod-external-id").value = prod ? prod.external_id || "" : "";

    document.getElementById("modal-product-title").textContent = prod ? "Edit Product" : "Add New Product";
    document.getElementById("modal-product").showModal();
  }

  function editProduct(id) {
    const prod = state.products.find((p) => p.id === id);
    if (prod) openProductModal(prod);
  }

  async function saveProduct(e) {
    e.preventDefault();
    const id = document.getElementById("prod-id").value;
    const body = {
      sku: document.getElementById("prod-sku").value,
      name: document.getElementById("prod-name").value,
      price: parseFloat(document.getElementById("prod-price").value),
      stock_quantity: parseInt(document.getElementById("prod-stock").value, 10),
      external_id: document.getElementById("prod-external-id").value || null,
    };

    try {
      if (id) {
        await apiFetch(`/products/${id}`, { method: "PUT", body });
        showToast("Product updated successfully! Integration event queued.", "success");
      } else {
        await apiFetch(`/products`, { method: "POST", body });
        showToast("Product created successfully! product.created event generated.", "success");
      }
      closeModal("modal-product");
      loadProducts();
    } catch (err) {
      showToast(`Error saving product: ${err.message}`, "error");
    }
  }

  async function deleteProduct(id) {
    const prod = state.products.find((p) => p.id === id);
    const name = prod ? prod.name : "product";
    if (!confirm(`Are you sure you want to delete product '${name}'?`)) return;
    try {
      await apiFetch(`/products/${id}`, { method: "DELETE" });
      showToast(`Product '${name}' deleted successfully! product.deleted event emitted.`, "success");
      loadProducts();
    } catch (err) {
      showToast(`Error deleting product: ${err.message}`, "error");
    }
  }

  // 4. ORDERS TAB
  async function loadOrders() {
    const statusFilter = document.getElementById("order-status-filter")?.value || "";
    const syncStatus = document.getElementById("order-sync-filter")?.value || "";
    const tbody = document.getElementById("orders-table-body");

    tbody.innerHTML = `<tr><td colspan="9" class="text-center">Loading orders...</td></tr>`;

    let url = `/orders?page_size=50`;
    if (statusFilter) url += `&status=${encodeURIComponent(statusFilter)}`;
    if (syncStatus) url += `&sync_status=${encodeURIComponent(syncStatus)}`;

    try {
      const res = await apiFetch(url);
      state.orders = res.data.items || [];
      renderOrdersTable(state.orders, res.data.total);
    } catch (err) {
      tbody.innerHTML = `<tr><td colspan="9" class="text-center text-danger">Failed to load orders: ${err.message}</td></tr>`;
    }
  }

  function renderOrdersTable(orders, total) {
    const tbody = document.getElementById("orders-table-body");
    if (orders.length === 0) {
      tbody.innerHTML = `<tr><td colspan="9" class="text-center">No orders found.</td></tr>`;
      return;
    }

    tbody.innerHTML = orders
      .map(
        (o) => `
      <tr>
        <td>${renderCopyableId(o.id, "Order ID")}</td>
        <td>${o.customer_id ? renderCopyableId(o.customer_id, "Customer ID") : "-"}</td>
        <td><strong>$${parseFloat(o.total_amount).toFixed(2)}</strong></td>
        <td><span class="badge badge-${getOrderStatusBadge(o.status)}">${o.status}</span></td>
        <td><code class="mono">${o.external_id || "<em>Unassigned</em>"}</code></td>
        <td>
          <div style="display:flex; gap:0.25rem; flex-wrap:wrap;">
            <span class="badge badge-neutral">${o.invoice_status}</span>
            <span class="badge badge-neutral">${o.payment_status}</span>
            <span class="badge badge-neutral">${o.delivery_status}</span>
          </div>
        </td>
        <td><span class="badge badge-${getEventStatusBadge(o.sync_status)}">${o.sync_status}</span></td>
        <td>${new Date(o.created_at).toLocaleDateString()}</td>
        <td>
          <button class="btn btn-sm btn-secondary" onclick="App.openOrderStatusModal('${o.id}', '${o.status}')">Update Status</button>
          <button class="btn btn-sm btn-ghost-danger" onclick="App.deleteOrder('${o.id}')">🗑️ Delete</button>
        </td>
      </tr>
    `
      )
      .join("");

    document.getElementById("orders-pagination").textContent = `Showing ${orders.length} of ${total} records`;
  }

  function getOrderStatusBadge(status) {
    if (status === "fulfilled") return "success";
    if (status === "confirmed") return "info";
    if (status === "draft") return "warning";
    if (status === "cancelled") return "danger";
    return "neutral";
  }

  // Create Order Wizard
  async function openCreateOrderModal() {
    document.getElementById("form-order").reset();
    state.orderWizardItems = [];
    document.getElementById("order-items-container").innerHTML = "";
    document.getElementById("order-wizard-total").textContent = "$0.00";

    // Populate Customer Selector
    const custSelect = document.getElementById("order-customer-select");
    custSelect.innerHTML = `<option value="">Loading customers...</option>`;

    try {
      const [custRes, prodRes] = await Promise.all([
        apiFetch("/customers?page_size=100"),
        apiFetch("/products?page_size=100"),
      ]);

      state.customers = custRes.data.items || [];
      state.cachedProducts = prodRes.data.items || [];

      custSelect.innerHTML = `<option value="">-- Select Customer --</option>` +
        state.customers.map((c) => `<option value="${c.id}">${escapeHtml(c.name)} (${c.email})</option>`).join("");

      // Add default first line item
      addOrderLineItem();
      document.getElementById("modal-order").showModal();
    } catch (err) {
      showToast("Error initializing order wizard: " + err.message, "error");
    }
  }

  function addOrderLineItem() {
    const container = document.getElementById("order-items-container");
    const index = state.orderWizardItems.length;
    state.orderWizardItems.push({ product_id: "", quantity: 1, unit_price: 0 });

    const row = document.createElement("div");
    row.className = "order-item-row";
    row.dataset.index = index;

    const prodOptions = state.cachedProducts
      .map((p) => `<option value="${p.id}" data-price="${p.price}">${escapeHtml(p.name)} ($${parseFloat(p.price).toFixed(2)})</option>`)
      .join("");

    row.innerHTML = `
      <select class="select-input item-prod-select" onchange="App.updateOrderLineItem(${index})" required>
        <option value="">-- Choose Product --</option>
        ${prodOptions}
      </select>
      <input type="number" min="1" value="1" class="text-input item-qty" oninput="App.updateOrderLineItem(${index})" required placeholder="Qty">
      <input type="number" step="0.01" value="0.00" class="text-input item-price" readonly placeholder="Unit Price">
      <button type="button" class="btn btn-ghost btn-sm" onclick="App.removeOrderLineItem(${index})">🗑️</button>
    `;
    container.appendChild(row);
  }

  function removeOrderLineItem(index) {
    const rows = document.querySelectorAll(".order-item-row");
    rows.forEach((r) => {
      if (parseInt(r.dataset.index, 10) === index) r.remove();
    });
    recalculateOrderTotal();
  }

  function updateOrderLineItem(index) {
    const rows = document.querySelectorAll(".order-item-row");
    let targetRow = null;
    rows.forEach((r) => {
      if (parseInt(r.dataset.index, 10) === index) targetRow = r;
    });

    if (!targetRow) return;

    const select = targetRow.querySelector(".item-prod-select");
    const qtyInput = targetRow.querySelector(".item-qty");
    const priceInput = targetRow.querySelector(".item-price");

    const selectedOption = select.options[select.selectedIndex];
    const price = selectedOption ? parseFloat(selectedOption.dataset.price || 0) : 0;
    priceInput.value = price.toFixed(2);

    recalculateOrderTotal();
  }

  function recalculateOrderTotal() {
    let total = 0;
    const rows = document.querySelectorAll(".order-item-row");
    rows.forEach((r) => {
      const price = parseFloat(r.querySelector(".item-price").value || 0);
      const qty = parseInt(r.querySelector(".item-qty").value || 1, 10);
      total += price * qty;
    });
    document.getElementById("order-wizard-total").textContent = `$${total.toFixed(2)}`;
  }

  async function saveOrder(e) {
    e.preventDefault();
    const customerId = document.getElementById("order-customer-select").value;
    const items = [];

    const rows = document.querySelectorAll(".order-item-row");
    rows.forEach((r) => {
      const productId = r.querySelector(".item-prod-select").value;
      const quantity = parseInt(r.querySelector(".item-qty").value, 10);
      const unitPrice = parseFloat(r.querySelector(".item-price").value);
      if (productId && quantity > 0) {
        items.push({ product_id: productId, quantity, unit_price: unitPrice });
      }
    });

    if (items.length === 0) {
      showToast("Please add at least one valid product line item.", "warning");
      return;
    }

    try {
      await apiFetch("/orders", {
        method: "POST",
        body: { customer_id: customerId, items },
      });
      showToast("Order created! order.created event generated for Prismatic.", "success");
      closeModal("modal-order");
      loadOrders();
    } catch (err) {
      showToast("Error creating order: " + err.message, "error");
    }
  }

  function openOrderStatusModal(orderId, currentStatus) {
    document.getElementById("status-order-id").value = orderId;
    document.getElementById("status-select").value = currentStatus;
    document.getElementById("modal-order-status").showModal();
  }

  async function saveOrderStatus(e) {
    e.preventDefault();
    const id = document.getElementById("status-order-id").value;
    const status = document.getElementById("status-select").value;

    try {
      await apiFetch(`/orders/${id}/status`, {
        method: "PUT",
        body: { status },
      });
      showToast(`Order status updated to '${status}'. Event order.status_changed dispatched!`, "success");
      closeModal("modal-order-status");
      loadOrders();
    } catch (err) {
      showToast("Error updating order status: " + err.message, "error");
    }
  }

  async function deleteOrder(id) {
    if (!confirm(`Are you sure you want to delete order '${id}'?`)) return;
    try {
      await apiFetch(`/orders/${id}`, { method: "DELETE" });
      showToast(`Order deleted successfully! order.deleted event emitted.`, "success");
      loadOrders();
    } catch (err) {
      showToast(`Error deleting order: ${err.message}`, "error");
    }
  }

  // 5. INTEGRATION HUB & SETTINGS
  async function loadPrismaticSettings() {
    try {
      const res = await apiFetch("/integrations/prismatic/settings");
      if (res.data) {
        const orgInput = document.getElementById("prismatic-org-id-input");
        const urlInput = document.getElementById("prismatic-webhook-url-input");
        const nameInput = document.getElementById("prismatic-name-input");
        const appUrlInput = document.getElementById("prismatic-url-input");
        const signingKeyInput = document.getElementById("prismatic-signing-key-input");
        const apiKeyInput = document.getElementById("prismatic-api-key-input");
        const statusBox = document.getElementById("prismatic-settings-status");

        if (orgInput) orgInput.value = res.data.prismatic_organization_id || "";
        if (urlInput) urlInput.value = res.data.prismatic_webhook_url || "";
        if (nameInput) nameInput.value = res.data.prismatic_integration_name || "";
        if (appUrlInput) appUrlInput.value = res.data.prismatic_url || "";
        if (signingKeyInput) signingKeyInput.value = res.data.prismatic_embedded_signing_key || "";
        if (apiKeyInput) apiKeyInput.value = res.data.prismatic_api_key || "";

        if (statusBox) {
          const hasOrg = Boolean(res.data.prismatic_organization_id);
          const hasKey = Boolean(res.data.has_signing_key);
          const hasWebhook = Boolean(res.data.prismatic_webhook_url);
          const hasApiKey = Boolean(res.data.prismatic_api_key);

          statusBox.innerHTML = `
            <strong>Prismatic Status:</strong>
            <span class="status-tag ${hasOrg ? 'ok' : 'warn'}">${hasOrg ? '✓ Org ID Configured' : '⚠ Org ID Missing'}</span>
            <span class="status-tag ${hasKey ? 'ok' : 'warn'}">${hasKey ? '✓ RSA Key Loaded' : '⚠ RSA Key Missing'}</span>
            <span class="status-tag ${hasWebhook ? 'ok' : 'warn'}">${hasWebhook ? '✓ Webhook URL Configured' : '⚠ Webhook URL Missing'}</span>
            <span class="status-tag ${hasApiKey ? 'ok' : 'warn'}">${hasApiKey ? '✓ API Key Configured' : '⚠ API Key Missing'}</span>
          `;
        }
      }
    } catch (err) {
      console.warn("Could not load Prismatic settings:", err);
    }
  }

  async function savePrismaticSettings() {
    const orgId = document.getElementById("prismatic-org-id-input")?.value.trim();
    const webhookUrl = document.getElementById("prismatic-webhook-url-input")?.value.trim();
    const name = document.getElementById("prismatic-name-input")?.value.trim();
    const appUrl = document.getElementById("prismatic-url-input")?.value.trim();
    const signingKey = document.getElementById("prismatic-signing-key-input")?.value;
    const apiKey = document.getElementById("prismatic-api-key-input")?.value.trim();

    try {
      await apiFetch("/integrations/prismatic/settings", {
        method: "PUT",
        body: {
          prismatic_organization_id: orgId,
          prismatic_webhook_url: webhookUrl,
          prismatic_integration_name: name,
          prismatic_url: appUrl,
          prismatic_embedded_signing_key: signingKey,
          prismatic_api_key: apiKey,
        },
      });
      showToast("Prismatic Integration Settings updated and saved persistently!", "success");
      await loadPrismaticSettings();
    } catch (err) {
      showToast(`Error saving Prismatic settings: ${err.message}`, "error");
    }
  }

  async function loadEvents() {
    const typeFilter = document.getElementById("event-type-filter")?.value || "";
    const statusFilter = document.getElementById("event-status-filter")?.value || "";
    const tbody = document.getElementById("events-table-body");

    tbody.innerHTML = `<tr><td colspan="8" class="text-center">Loading integration events...</td></tr>`;

    let url = `/integration-events?page_size=50`;
    if (typeFilter) url += `&event_type=${encodeURIComponent(typeFilter)}`;
    if (statusFilter) url += `&status=${encodeURIComponent(statusFilter)}`;

    try {
      const res = await apiFetch(url);
      state.events = res.data.items || [];
      renderEventsTable(state.events, res.data.total);
    } catch (err) {
      tbody.innerHTML = `<tr><td colspan="8" class="text-center text-danger">Failed to load events: ${err.message}</td></tr>`;
    }
  }

  function renderEventsTable(events, total) {
    const tbody = document.getElementById("events-table-body");
    if (events.length === 0) {
      tbody.innerHTML = `<tr><td colspan="8" class="text-center">No integration events found.</td></tr>`;
      return;
    }

    tbody.innerHTML = events
      .map(
        (ev) => `
      <tr>
        <td>${renderCopyableId(ev.id, "Event ID")}</td>
        <td><strong><code>${ev.event_type}</code></strong></td>
        <td>${ev.entity_type}</td>
        <td>${renderCopyableId(ev.entity_id, "Entity ID")}</td>
        <td><span class="badge badge-${getEventStatusBadge(ev.status)}">${ev.status}</span></td>
        <td>${ev.retry_count}</td>
        <td>${new Date(ev.created_at).toLocaleString()}</td>
        <td>
          <button class="btn btn-sm btn-ghost" onclick="App.viewEventJson('${ev.id}')">🔍 View JSON</button>
          <button class="btn btn-sm btn-secondary" onclick="App.retryEvent('${ev.id}')">🔄 Retry</button>
        </td>
      </tr>
    `
      )
      .join("");

    document.getElementById("events-pagination").textContent = `Showing ${events.length} of ${total} records`;
  }

  function viewEventJson(id) {
    const ev = state.events.find((e) => e.id === id);
    if (!ev) return;
    document.getElementById("event-json-title").textContent = `Event: ${ev.event_type} (${ev.id.substring(0, 8)}...)`;
    document.getElementById("event-json-code").textContent = JSON.stringify(ev.payload, null, 2);
    document.getElementById("modal-event-json").showModal();
  }

  async function retryEvent(id) {
    try {
      const res = await apiFetch(`/integration-events/${id}/retry`, { method: "POST" });
      showToast(`Event queued for delivery. Status is now '${res.data.status}'.`, "success");
      loadEvents();
    } catch (err) {
      showToast("Error retrying event: " + err.message, "error");
    }
  }

  // 6. ODOO WEBHOOK SIMULATOR TAB
  function updateWebhookFormFields() {
    const type = document.getElementById("sim-entity-type").value;
    const orderFields = document.getElementById("sim-order-fields");
    if (type === "order") {
      orderFields.style.display = "grid";
    } else {
      orderFields.style.display = "none";
    }
  }

  async function submitWebhookSim(e) {
    e.preventDefault();
    const entityType = document.getElementById("sim-entity-type").value;
    const entityId = document.getElementById("sim-entity-id").value.trim();
    const externalId = document.getElementById("sim-external-id").value.trim();
    const syncStatus = document.getElementById("sim-sync-status").value;
    const syncError = document.getElementById("sim-sync-error").value.trim() || null;

    const payload = {
      entity_type: entityType,
      entity_id: entityId,
      external_id: externalId,
      sync_status: syncStatus,
      sync_error: syncError,
    };

    if (entityType === "order") {
      payload.invoice_status = document.getElementById("sim-invoice-status").value;
      payload.payment_status = document.getElementById("sim-payment-status").value;
      payload.delivery_status = document.getElementById("sim-delivery-status").value;
    }

    try {
      const res = await apiFetch("/webhooks/odoo", {
        method: "POST",
        body: payload,
      });

      const box = document.getElementById("sim-result-box");
      const code = document.getElementById("sim-result-code");
      box.classList.remove("hidden");
      code.textContent = JSON.stringify(res.data, null, 2);

      showToast(`Webhook processed! Target ${entityType} updated with sync status: ${res.data.sync_status}`, "success");
    } catch (err) {
      showToast("Webhook simulator error: " + err.message, "error");
    }
  }

  // 7. TENANT ADMIN TAB
  async function loadTenants() {
    const adminKey = document.getElementById("admin-key-input").value.trim();
    if (adminKey) {
      state.adminKey = adminKey;
      localStorage.setItem("veridata_admin_key", adminKey);
    }

    const tbody = document.getElementById("tenants-table-body");
    tbody.innerHTML = `<tr><td colspan="4" class="text-center">Loading tenants...</td></tr>`;

    try {
      const res = await apiFetch("/tenants?page_size=50", { useAdmin: true });
      state.tenants = res.data.items || [];
      renderTenantsTable(state.tenants);
    } catch (err) {
      tbody.innerHTML = `<tr><td colspan="4" class="text-center text-danger">Failed to load tenants: ${err.message}. Check Admin API Key.</td></tr>`;
    }
  }

  function renderTenantsTable(tenants) {
    const tbody = document.getElementById("tenants-table-body");
    if (tenants.length === 0) {
      tbody.innerHTML = `<tr><td colspan="4" class="text-center">No tenants registered.</td></tr>`;
      return;
    }

    tbody.innerHTML = tenants
      .map(
        (t) => `
      <tr>
        <td>${renderCopyableId(t.id, "Tenant ID")}</td>
        <td><strong>${escapeHtml(t.name)}</strong></td>
        <td><code class="mono">${escapeHtml(t.external_odoo_instance_id)}</code></td>
        <td>${new Date(t.created_at).toLocaleString()}</td>
      </tr>
    `
      )
      .join("");
  }

  function openCreateTenantModal() {
    document.getElementById("form-tenant").reset();
    document.getElementById("modal-tenant").showModal();
  }

  async function saveTenant(e) {
    e.preventDefault();
    const name = document.getElementById("tenant-name-input").value.trim();
    const odooId = document.getElementById("tenant-odoo-input").value.trim();
    const apiKey = document.getElementById("tenant-key-input").value.trim() || null;

    try {
      const res = await apiFetch("/tenants", {
        method: "POST",
        useAdmin: true,
        body: { name, external_odoo_instance_id: odooId, api_key: apiKey },
      });
      showToast(`Tenant '${res.data.name}' created! API Key: ${res.data.api_key}`, "success");
      closeModal("modal-tenant");
      loadTenants();
    } catch (err) {
      showToast("Error creating tenant: " + err.message, "error");
    }
  }

  // 8. IDEMPOTENCY SANDBOX TAB
  function generateNewSandboxKey() {
    state.sandboxKey = "idemp-" + Math.random().toString(36).substring(2, 10) + "-" + Date.now();
    const inputEl = document.getElementById("sandbox-key");
    if (inputEl) inputEl.value = state.sandboxKey;

    const outputBox = document.getElementById("sandbox-output-box");
    if (outputBox) outputBox.classList.add("hidden");
  }

  async function testIdempotencyRequest(stepNum) {
    const key = state.sandboxKey;
    const body = {
      name: `Idempotency Test Customer (${key.substring(0, 10)})`,
      email: `idemp-${Date.now()}@test.example`,
      phone: "+1-555-0000",
    };

    const outputBox = document.getElementById("sandbox-output-box");
    const statusBadge = document.getElementById("sandbox-status-badge");
    const cachedFlag = document.getElementById("sandbox-cached-flag");
    const outputCode = document.getElementById("sandbox-output-code");

    if (outputBox) outputBox.classList.remove("hidden");

    try {
      const res = await apiFetch("/customers", {
        method: "POST",
        idempotencyKey: key,
        body,
      });

      if (statusBadge) {
        statusBadge.textContent = `HTTP ${res.status} OK`;
        statusBadge.className = stepNum === 2 ? "badge badge-warning" : "badge badge-success";
      }
      if (cachedFlag) {
        cachedFlag.textContent = stepNum === 2 ? "Intercepted: Returned cached response" : "Initial Request: Entity Created";
      }
      if (outputCode) {
        outputCode.textContent = JSON.stringify(res.data, null, 2);
      }

      if (stepNum === 1) {
        showToast("Initial request completed! Record created in database.", "success");
      } else {
        showToast("Duplicate request intercepted! Returned identical cached response.", "warning");
      }
    } catch (err) {
      if (statusBadge) {
        statusBadge.textContent = `HTTP Error`;
        statusBadge.className = "badge badge-danger";
      }
      if (cachedFlag) cachedFlag.textContent = "";
      if (outputCode) outputCode.textContent = err.message;
    }
  }

  // Modal helpers & Utilities
  function closeModal(modalId) {
    const el = document.getElementById(modalId);
    if (el) el.close();
  }

  function escapeHtml(str) {
    if (!str) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  // DOMContentLoaded Initializer
  document.addEventListener("DOMContentLoaded", init);

  return {
    copyToClipboard,
    switchTab,
    toggleTheme,
    seedDatabase,
    promptApiKey,
    connectOdoo,
    refreshOverview,
    loadCustomers,
    openCustomerModal,
    editCustomer,
    saveCustomer,
    deleteCustomer,
    loadProducts,
    openProductModal,
    editProduct,
    saveProduct,
    deleteProduct,
    loadOrders,
    openCreateOrderModal,
    addOrderLineItem,
    removeOrderLineItem,
    updateOrderLineItem,
    saveOrder,
    openOrderStatusModal,
    saveOrderStatus,
    deleteOrder,
    loadEvents,
    loadPrismaticSettings,
    savePrismaticSettings,
    loadOverview,
    viewOverviewEventJson,
    retryOverviewEvent,
    viewEventJson,
    retryEvent,
    updateWebhookFormFields,
    submitWebhookSim,
    loadTenants,
    openCreateTenantModal,
    saveTenant,
    generateNewSandboxKey,
    testIdempotencyRequest,
    closeModal,
  };
})();
