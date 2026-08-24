"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { useSession } from "next-auth/react";
import { validatePassword } from "../../lib/validation";
import { 
  FiUserPlus, 
  FiEdit, 
  FiTrash2, 
  FiEyeOff,
  FiSave,
  FiX,
  FiSearch,
  FiShield,
  FiLink,
  FiMail,
  FiClock,
  FiCheckCircle,
  FiRefreshCw,
  FiMoreVertical,
  FiAlertCircle,
  FiUsers,
  FiFileText,
  FiDatabase,
  FiChevronLeft,
  FiChevronRight,
} from "react-icons/fi";
import { useGuidePrepare } from "@/lib/guideNav";

const ROLES = {
  SUPER_ADMIN: "super_admin",
  USER: "user",
  VIEWER: "viewer",
  SMM: "smm",
  APPROVER: "approver",
};

/**
 * The console used to be one long scroll of unrelated settings cards with the
 * user table buried at the bottom. Grouping them into tabs puts people first
 * and keeps each concern a click away instead of a scroll away.
 */
const ADMIN_TABS = [
  { id: "people", label: "People", icon: FiUsers },
  { id: "reports", label: "Reports", icon: FiFileText },
  { id: "sources", label: "Data sources", icon: FiDatabase },
  { id: "automation", label: "Automation", icon: FiClock },
];

/**
 * Role presentation, written out as literal class strings — Tailwind can't see
 * colours assembled at runtime.
 */
const ROLE_META = {
  [ROLES.SUPER_ADMIN]: {
    label: "Super admin",
    pill: "border-[color-mix(in_srgb,#b184ff_40%,var(--cw-hairline))] bg-[color-mix(in_srgb,#b184ff_16%,var(--cw-surface))] text-[#c9a9ff]",
  },
  [ROLES.USER]: {
    label: "User",
    pill: "border-[color-mix(in_srgb,var(--cw-info)_40%,var(--cw-hairline))] bg-[color-mix(in_srgb,var(--cw-info)_14%,var(--cw-surface))] text-[var(--cw-info)]",
  },
  [ROLES.VIEWER]: {
    label: "Viewer",
    pill: "border-[var(--cw-hairline-strong)] bg-[var(--cw-overlay)] text-[var(--cw-ink-dim)]",
  },
  [ROLES.SMM]: {
    label: "SMM",
    pill: "border-[color-mix(in_srgb,var(--cw-neon)_40%,var(--cw-hairline))] bg-[color-mix(in_srgb,var(--cw-neon)_14%,var(--cw-surface))] text-[var(--cw-neon)]",
  },
  [ROLES.APPROVER]: {
    label: "Approver",
    pill: "border-[color-mix(in_srgb,var(--cw-caution)_40%,var(--cw-hairline))] bg-[color-mix(in_srgb,var(--cw-caution)_14%,var(--cw-surface))] text-[var(--cw-caution)]",
  },
};

const ROLE_FILTERS = [
  { id: "all", label: "Everyone" },
  { id: ROLES.SUPER_ADMIN, label: "Super admins" },
  { id: ROLES.USER, label: "Users" },
  { id: ROLES.VIEWER, label: "Viewers" },
  { id: ROLES.SMM, label: "SMM" },
  { id: ROLES.APPROVER, label: "Approvers" },
];

/** Initials for the avatar chip, falling back to the email's first letter. */
function userInitials(user) {
  const source = String(user?.name || "").trim() || String(user?.email || "").trim();
  if (!source) return "?";
  const parts = source.replace(/@.*$/, "").split(/[\s._-]+/).filter(Boolean);
  const letters = parts.slice(0, 2).map((p) => p[0]);
  return (letters.join("") || source[0]).toUpperCase();
}

const fieldClass =
  "w-full rounded-xl border border-[var(--cw-hairline)] bg-[var(--cw-raised)] px-4 py-2 text-sm text-[var(--cw-ink)] transition-smooth placeholder:text-[var(--cw-ink-faint)] focus:border-[var(--cw-neon)] focus:outline-none focus:ring-2 focus:ring-[color-mix(in_srgb,var(--cw-neon)_28%,transparent)] disabled:opacity-60";

const labelClass = "mb-2 block text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--cw-ink-faint)]";

const checkboxClass =
  "h-4 w-4 shrink-0 rounded border-[var(--cw-hairline-strong)] bg-[var(--cw-raised)] text-[var(--cw-neon)] accent-[var(--cw-neon)] focus:ring-2 focus:ring-[color-mix(in_srgb,var(--cw-neon)_28%,transparent)]";

const cardClass = "rounded-2xl border border-[var(--cw-hairline)] bg-[var(--cw-surface)]";

const DEFAULT_SMM_BASELINES = [
  { platform: "facebook", accountHandle: "", followers: "" },
  { platform: "instagram", accountHandle: "", followers: "" },
  { platform: "youtube", accountHandle: "", followers: "" },
  { platform: "tiktok", accountHandle: "", followers: "" },
];

const SMM_BASELINE_PLATFORM_LABEL = {
  facebook: "Facebook",
  instagram: "Instagram",
  youtube: "YouTube",
  tiktok: "TikTok",
};
import SiteAssociationsModal from "./SiteAssociationsModal";
import SeoDigestSettingsPanel from "./SeoDigestSettingsPanel";
import DataSourcesPanel from "./DataSourcesPanel";
import ReportsManagementPanel from "./ReportsManagementPanel";
import CronJobsPanel from "./CronJobsPanel";
import ModulePermissionPicker from "./ModulePermissionPicker";
import { coerceModulePermissionsForForm, getDefaultModulePermissionsForRole } from "@/lib/modulePermissions";
import { getDefaultReportPreferencesForRole } from "@/lib/reports/reportPreferences";

const EMPTY_USER_FORM = {
  email: "",
  password: "",
  name: "",
  role: "user",
  siteLink: "",
  gtmContainerId: "",
  facebookPageId: "",
  instagramUserId: "",
  isActive: true,
  accessibleSites: [],
  modulePermissions: getDefaultModulePermissionsForRole("user"),
  ...getDefaultReportPreferencesForRole("user"),
};

export default function AdminSection({ onNavigate } = {}) {
  const { data: session } = useSession();
  const [users, setUsers] = useState([]);
  const [availableIntegrations, setAvailableIntegrations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [adminTab, setAdminTab] = useState("people");
  useGuidePrepare((nav) => {
    if (nav.adminTab) setAdminTab(nav.adminTab);
  });
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [formData, setFormData] = useState({ ...EMPTY_USER_FORM });
  const [currentPage, setCurrentPage] = useState(1);
  const [activeActionMenuUserId, setActiveActionMenuUserId] = useState(null);
  const [successMessage, setSuccessMessage] = useState("");
  const [showAdvancedSettings, setShowAdvancedSettings] = useState(false);
  const [showSiteAssociations, setShowSiteAssociations] = useState(false);
  const [portalReady, setPortalReady] = useState(false);
  const [siteIntegrationForm, setSiteIntegrationForm] = useState({
    userId: "",
    siteUrl: "",
    propertyId: "",
    emailOrVerification: "",
  });
  const [integratingSite, setIntegratingSite] = useState(false);
  const [integrationPreview, setIntegrationPreview] = useState(null);
  const [savingSmmBaseline, setSavingSmmBaseline] = useState(false);
  const [fetchingSmmFromHandles, setFetchingSmmFromHandles] = useState(false);
  const [loadingSmmBaseline, setLoadingSmmBaseline] = useState(false);
  const [smmBaselines, setSmmBaselines] = useState(DEFAULT_SMM_BASELINES);
  const [smmFetchStatusByPlatform, setSmmFetchStatusByPlatform] = useState({});

  // Meta Accounts Dropdown State
  const [metaAccounts, setMetaAccounts] = useState([]);
  const [loadingMetaAccounts, setLoadingMetaAccounts] = useState(false);
  const [metaAccountsError, setMetaAccountsError] = useState("");
  const [syncingMetaPages, setSyncingMetaPages] = useState(false);

  useEffect(() => {
    fetchUsers();
  }, []);

  useEffect(() => {
    setPortalReady(true);
  }, []);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, roleFilter]);

  useEffect(() => {
    if (showCreateModal || editingUser) {
      fetchMetaAccounts();
      fetchAvailableIntegrations();
    }
  }, [showCreateModal, editingUser]);

  const fetchAvailableIntegrations = async () => {
    try {
      const res = await fetch("/api/admin/site-integrations");
      const data = await res.json();
      if (res.ok && data.sites) {
        setAvailableIntegrations(data.sites);
      }
    } catch (err) {
      console.error("Failed to load integrations", err);
    }
  };

  const fetchMetaAccounts = async () => {
    setLoadingMetaAccounts(true);
    setMetaAccountsError("");
    try {
      const res = await fetch("/api/admin/meta-accounts");
      const data = await res.json().catch(() => ({}));
      const accounts = Array.isArray(data.accounts) ? data.accounts : [];
      setMetaAccounts(accounts);
      if (!res.ok) {
        setMetaAccountsError(data.error || `Failed to load Meta accounts (${res.status})`);
      } else if (accounts.length === 0) {
        setMetaAccountsError(
          data.error ||
            "No Meta accounts found. Set META_PAGE_ACCESS_TOKEN on the server (Render env), then redeploy/restart."
        );
      } else if (data.warning) {
        setMetaAccountsError(data.warning);
      } else {
        setMetaAccountsError("");
      }
    } catch (err) {
      console.error("Failed to load Meta accounts", err);
      setMetaAccounts([]);
      setMetaAccountsError(err.message || "Failed to load Meta accounts");
    } finally {
      setLoadingMetaAccounts(false);
    }
  };

  const syncMetaPages = async () => {
    setSyncingMetaPages(true);
    setMetaAccountsError("");
    try {
      const res = await fetch("/api/admin/meta-accounts", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      const accounts = Array.isArray(data.accounts) ? data.accounts : [];
      setMetaAccounts(accounts);
      if (!res.ok) {
        setMetaAccountsError(data.error || `Failed to fetch Meta pages (${res.status})`);
        setError(data.error || "Failed to fetch Meta pages.");
        return;
      }
      await fetchAvailableIntegrations();
      if (accounts.length === 0) {
        const msg =
          data.error ||
          "Meta returned no pages. Check META_PAGE_ACCESS_TOKEN on the server, then try again.";
        setMetaAccountsError(msg);
        setError(msg);
      } else {
        setMetaAccountsError(data.warning || "");
        setSuccessMessage(
          data.message ||
            `Fetched ${accounts.length} Meta ${accounts.length === 1 ? "page" : "pages"} as projects.`
        );
        setError("");
        setTimeout(() => setSuccessMessage(""), 6000);
      }
    } catch (err) {
      console.error("Failed to fetch Meta pages", err);
      setMetaAccounts([]);
      const msg = err.message || "Failed to fetch Meta pages";
      setMetaAccountsError(msg);
      setError(msg);
    } finally {
      setSyncingMetaPages(false);
    }
  };

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/admin/users?includeInactive=true");
      if (!res.ok) {
        throw new Error("Failed to fetch users");
      }
      const data = await res.json();
      setUsers(data.users || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateUser = async (e) => {
    e.preventDefault();
    setError("");

    try {
      const newPassword = String(formData.password || "").trim();
      if (newPassword) {
        const pwdCheck = validatePassword(newPassword);
        if (!pwdCheck.valid) {
          setError(pwdCheck.errors.join("; ") || "Invalid password.");
          return;
        }
      }

      const payload = {
        name: formData.name,
        isActive: formData.isActive,
        gtmContainerId: formData.gtmContainerId || null,
        facebookPageId: formData.facebookPageId || null,
        instagramUserId: formData.instagramUserId || null,
        accessibleSites: formData.accessibleSites || [],
        weeklyDigestEnabled: Boolean(formData.weeklyDigestEnabled),
        receiveWebsiteReport: Boolean(formData.receiveWebsiteReport),
        receiveSmmReport: Boolean(formData.receiveSmmReport),
        receiveCombinedReport: Boolean(formData.receiveCombinedReport),
      };
      if (editingUser?.role !== ROLES.SUPER_ADMIN) {
        payload.role = formData.role;
        payload.modulePermissions = formData.modulePermissions;
      }
      const siteTrim = String(formData.siteLink || "").trim();
      if (siteTrim) {
        payload.siteLink = siteTrim;
      }
      if (newPassword) {
        payload.password = newPassword;
      }

      const res = await fetch(`/api/admin/users/${editingUser.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to update user");
      }

      if (editingUser?.role !== ROLES.SUPER_ADMIN) {
        try {
          await persistSmmBaseline(smmBaselines, { showMessage: false, clearMessages: false });
        } catch {
          // Don't block user profile update if baseline persistence fails.
        }
      }

      closeUserModal();
      fetchUsers();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleDeleteUser = async (userId) => {
    if (!confirm("Are you sure you want to delete this user?")) {
      return;
    }

    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to delete user");
      }

      fetchUsers();
    } catch (err) {
      setError(err.message);
    }
  };

  const closeUserModal = () => {
    setShowCreateModal(false);
    setEditingUser(null);
    setShowAdvancedSettings(false);
    setFormData({
      ...EMPTY_USER_FORM,
      modulePermissions: getDefaultModulePermissionsForRole("user"),
      ...getDefaultReportPreferencesForRole("user"),
    });
    setSiteIntegrationForm({
      userId: "",
      siteUrl: "",
      propertyId: "",
      emailOrVerification: "",
    });
    setIntegrationPreview(null);
    setSmmBaselines(
      DEFAULT_SMM_BASELINES.map((row) => ({
        ...row,
        accountHandle: "",
        followers: "",
      }))
    );
    setSmmFetchStatusByPlatform({});
  };

  const handleEdit = (user) => {
    setActiveActionMenuUserId(null);
    setShowCreateModal(false);
    setShowAdvancedSettings(false);
    setError("");
    setEditingUser(user);
    const reportDefaults = getDefaultReportPreferencesForRole(user.role || "user");
    setFormData({
      email: user.email,
      password: "",
      name: user.name || "",
      role: user.role || "user",
      siteLink: user.siteLink || "",
      gtmContainerId: user.gtmContainerId || "",
      facebookPageId: user.facebookPageId || "",
      instagramUserId: user.instagramUserId || "",
      isActive: user.isActive !== false,
      accessibleSites: Array.isArray(user.accessibleSites)
        ? user.accessibleSites.map((s) => s.siteLink || s)
        : [],
      modulePermissions: coerceModulePermissionsForForm(user.modulePermissions, user.role || "user"),
      weeklyDigestEnabled:
        user.weeklyDigestEnabled != null ? Boolean(user.weeklyDigestEnabled) : reportDefaults.weeklyDigestEnabled,
      receiveWebsiteReport:
        user.receiveWebsiteReport != null
          ? Boolean(user.receiveWebsiteReport)
          : reportDefaults.receiveWebsiteReport,
      receiveSmmReport:
        user.receiveSmmReport != null ? Boolean(user.receiveSmmReport) : reportDefaults.receiveSmmReport,
      receiveCombinedReport:
        user.receiveCombinedReport != null
          ? Boolean(user.receiveCombinedReport)
          : reportDefaults.receiveCombinedReport,
    });
    setSiteIntegrationForm({
      userId: user.id,
      siteUrl: user.siteLink || "",
      propertyId: user.siteLink || "",
      emailOrVerification: user.email || "",
    });
    setIntegrationPreview(null);
    setSmmBaselines(
      DEFAULT_SMM_BASELINES.map((row) => ({
        ...row,
        accountHandle: "",
        followers: "",
      }))
    );
    setSmmFetchStatusByPlatform({});
    loadExistingSmmBaseline(user);
  };

  const loadExistingSmmBaseline = async (user) => {
    if (!user?.id || !user?.siteLink) return;
    setLoadingSmmBaseline(true);
    try {
      const query = new URLSearchParams({
        userId: user.id,
        siteUrl: user.siteLink,
      });
      const res = await fetch(`/api/admin/smm/baseline?${query.toString()}`);
      if (!res.ok) return;
      const data = await res.json();
      const map = new Map();
      for (const row of data.baselines || []) {
        const key = row.platform === "x" ? "tiktok" : row.platform;
        const existing = map.get(key);
        if (
          !existing ||
          Number(row.followers || 0) >= Number(existing.followers || 0)
        ) {
          map.set(key, { ...row, platform: key });
        }
      }
      setSmmBaselines(
        DEFAULT_SMM_BASELINES.map((row) => ({
          ...row,
          accountHandle: map.get(row.platform)?.accountHandle || "",
          followers:
            map.get(row.platform)?.followers !== undefined
              ? String(map.get(row.platform).followers)
              : "",
        }))
      );
    } catch {
      // Keep current defaults if loading fails.
    } finally {
      setLoadingSmmBaseline(false);
    }
  };

  const saveSiteIntegrationForUserId = async (userId, { silent = false } = {}) => {
    if (!silent) {
      setError("");
      setSuccessMessage("");
      setIntegrationPreview(null);
      setIntegratingSite(true);
    }
    try {
      const res = await fetch("/api/admin/site-integrations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          siteUrl: siteIntegrationForm.siteUrl,
          propertyId: siteIntegrationForm.propertyId,
          emailOrVerification:
            String(siteIntegrationForm.emailOrVerification || "").trim() || formData.email,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.details || data.error || "Failed to save site integration");
      }
      if (!silent) {
        setSuccessMessage(data.message || "Site integration saved successfully.");
        setIntegrationPreview(data.preview || null);
        setFormData((prev) => ({ ...prev, siteLink: data.site || prev.siteLink }));
        setSiteIntegrationForm((prev) => ({
          ...prev,
          userId,
          siteUrl: data.site || prev.siteUrl,
          propertyId: data.site || prev.propertyId,
          emailOrVerification: prev.emailOrVerification,
        }));
        fetchUsers();
        setTimeout(() => setSuccessMessage(""), 5000);
      }
      return data;
    } catch (err) {
      if (!silent) setError(err.message);
      throw err;
    } finally {
      if (!silent) setIntegratingSite(false);
    }
  };

  const handleSaveSiteIntegrationForUser = async () => {
    if (!editingUser?.id) return;
    if (editingUser?.role === ROLES.SUPER_ADMIN) {
      setError("Site Integration is available only for regular users.");
      return;
    }
    try {
      await saveSiteIntegrationForUserId(editingUser.id, { silent: false });
    } catch {
      // Error surfaced in saveSiteIntegrationForUserId
    }
  };

  const handleSmmBaselineChange = (platform, key, value) => {
    setSmmBaselines((prev) =>
      prev.map((row) => (row.platform === platform ? { ...row, [key]: value } : row))
    );
    setSmmFetchStatusByPlatform((prev) => {
      const next = { ...prev };
      delete next[platform];
      return next;
    });
  };

  const persistSmmBaseline = async (
    baselineRows,
    {
      showMessage = true,
      clearMessages = true,
      forUserId,
      forSiteUrl,
      accountNameFallback,
      accountEmailFallback,
    } = {}
  ) => {
    const userId = forUserId ?? editingUser?.id;
    if (!userId) {
      throw new Error("User is required to save SMM baseline.");
    }
    if (!forUserId && editingUser?.role === ROLES.SUPER_ADMIN) return;

    const targetSite =
      String(forSiteUrl || "").trim() ||
      siteIntegrationForm.siteUrl ||
      formData.siteLink ||
      "";
    if (!targetSite) {
      throw new Error("Please set Site URL or Site Link before saving SMM baseline.");
    }

    const rowsToPersist = baselineRows.filter((row) => {
      const hasHandle = Boolean(String(row.accountHandle || "").trim());
      const followers = Number(row.followers || 0);
      return hasHandle || followers > 0;
    });
    if (!rowsToPersist.length) {
      throw new Error("Please provide at least one handle or follower value before saving baseline.");
    }

    const accountLabel =
      String(accountNameFallback || "").trim() ||
      editingUser?.name ||
      String(accountEmailFallback || "").trim() ||
      editingUser?.email ||
      "";

    const res = await fetch("/api/admin/smm/baseline", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId,
        siteUrl: targetSite,
        baselines: rowsToPersist.map((row) => ({
          platform: row.platform,
          accountName: accountLabel,
          accountHandle: row.accountHandle,
          followers: Number(row.followers || 0),
        })),
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || "Failed to save SMM baseline.");
    }

    if (showMessage) {
      setSuccessMessage("SMM baseline saved. Follower cards will show these numbers immediately.");
      setTimeout(() => setSuccessMessage(""), 5000);
    }
    if (clearMessages) {
      setError("");
      setSuccessMessage("");
    }
  };

  const handleSaveSmmBaseline = async () => {
    setSavingSmmBaseline(true);
    setError("");
    setSuccessMessage("");
    try {
      await persistSmmBaseline(smmBaselines, { showMessage: true, clearMessages: false });
    } catch (err) {
      setError(err.message || "Failed to save SMM baseline.");
    } finally {
      setSavingSmmBaseline(false);
    }
  };

  const handleFetchSmmFromHandles = async () => {
    if (!editingUser?.id) {
      setError("Create the user first, then use Edit to fetch follower counts from handles.");
      return;
    }
    if (editingUser?.role === ROLES.SUPER_ADMIN) return;
    const targetSite = siteIntegrationForm.siteUrl || formData.siteLink || "";
    if (!targetSite) {
      setError("Please save site integration first, then fetch followers by handles.");
      return;
    }

    const withHandles = smmBaselines.filter((row) => String(row.accountHandle || "").trim());
    if (!withHandles.length) {
      setError("Please enter at least one account handle to fetch followers.");
      return;
    }

    setFetchingSmmFromHandles(true);
    setError("");
    setSuccessMessage("");
    setSmmFetchStatusByPlatform(
      withHandles.reduce((acc, row) => {
        acc[row.platform] = { status: "loading", reason: "Fetching..." };
        return acc;
      }, {})
    );
    try {
      const res = await fetch("/api/admin/smm/fetch-handles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: editingUser.id,
          siteUrl: targetSite,
          facebookPageId: formData.facebookPageId || "",
          instagramUserId: formData.instagramUserId || "",
          accounts: withHandles.map((row) => ({
            platform: row.platform,
            accountHandle: row.accountHandle,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to fetch followers from handles.");
      }

      const statusMap = {};
      (data.resolved || []).forEach((item) => {
        statusMap[item.platform] = {
          status: "resolved",
          reason: `Followers found: ${Number(item.followers || 0).toLocaleString("en-US")}`,
        };
      });
      (data.skipped || []).forEach((item) => {
        statusMap[item.platform] = {
          status: "skipped",
          reason: item.reason || "Not resolved from handle.",
        };
      });
      setSmmFetchStatusByPlatform((prev) => ({ ...prev, ...statusMap }));

      if (Array.isArray(data.resolved) && data.resolved.length > 0) {
        const mergedRows = smmBaselines.map((row) => {
            const matched = data.resolved.find((item) => item.platform === row.platform);
            if (!matched) return row;
            return {
              ...row,
              accountHandle: matched.accountHandle || row.accountHandle,
              followers: Number(matched.followers || 0),
            };
          });
        setSmmBaselines(mergedRows);
        await persistSmmBaseline(mergedRows, { showMessage: false, clearMessages: false });
        setSuccessMessage("Followers fetched and saved. SMM fields will stay populated.");
      } else if (Array.isArray(data.skipped) && data.skipped.length > 0) {
        setError(data.skipped[0].reason || "No followers resolved from provided handles.");
      } else {
        setError("No followers resolved from provided handles.");
      }
      setTimeout(() => setSuccessMessage(""), 5000);
    } catch (err) {
      setError(err.message || "Failed to fetch followers from handles.");
    } finally {
      setFetchingSmmFromHandles(false);
    }
  };

  const handleCreateUser = async (e) => {
    e.preventDefault();
    setError("");

    try {
      const pwdCheck = validatePassword(formData.password);
      if (!pwdCheck.valid) {
        setError(pwdCheck.errors.join("; ") || "Invalid password.");
        return;
      }

      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: formData.email,
          password: formData.password,
          name: formData.name,
          role: formData.role,
          siteLink: formData.siteLink || null,
          isActive: formData.isActive === true,
          gtmContainerId: formData.gtmContainerId || null,
          facebookPageId: formData.facebookPageId || null,
          instagramUserId: formData.instagramUserId || null,
          accessibleSites: formData.accessibleSites || [],
          modulePermissions: formData.modulePermissions,
          weeklyDigestEnabled: Boolean(formData.weeklyDigestEnabled),
          receiveWebsiteReport: Boolean(formData.receiveWebsiteReport),
          receiveSmmReport: Boolean(formData.receiveSmmReport),
          receiveCombinedReport: Boolean(formData.receiveCombinedReport),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to create user");
      }

      const newUser = data.user;
      const followUpErrors = [];

      if (newUser?.id) {
        const hasIntegrationInput =
          String(siteIntegrationForm.siteUrl || "").trim() ||
          String(siteIntegrationForm.propertyId || "").trim();

        let resolvedSiteForSmm = String(
          formData.siteLink || siteIntegrationForm.siteUrl || ""
        ).trim();

        if (hasIntegrationInput) {
          try {
            const integData = await saveSiteIntegrationForUserId(newUser.id, { silent: true });
            if (integData?.site) {
              resolvedSiteForSmm = String(integData.site).trim() || resolvedSiteForSmm;
            }
          } catch (intErr) {
            followUpErrors.push(`Site integration: ${intErr.message}`);
          }
        }

        const rowsToPersist = smmBaselines.filter((row) => {
          const hasHandle = Boolean(String(row.accountHandle || "").trim());
          const followers = Number(row.followers || 0);
          return hasHandle || followers > 0;
        });

        if (rowsToPersist.length > 0 && resolvedSiteForSmm) {
          try {
            await persistSmmBaseline(smmBaselines, {
              showMessage: false,
              clearMessages: false,
              forUserId: newUser.id,
              forSiteUrl: resolvedSiteForSmm,
              accountNameFallback: formData.name,
              accountEmailFallback: formData.email,
            });
          } catch (smmErr) {
            followUpErrors.push(`SMM baseline: ${smmErr.message}`);
          }
        } else if (rowsToPersist.length > 0 && !resolvedSiteForSmm) {
          followUpErrors.push(
            "SMM baseline: add a Site Link or Site URL / Property ID so baseline can be saved."
          );
        }
      }

      setShowCreateModal(false);
      setFormData({ ...EMPTY_USER_FORM, modulePermissions: getDefaultModulePermissionsForRole("user") });
      setSiteIntegrationForm({
        userId: "",
        siteUrl: "",
        propertyId: "",
        emailOrVerification: "",
      });
      setIntegrationPreview(null);
      setSmmBaselines(
        DEFAULT_SMM_BASELINES.map((row) => ({
          ...row,
          accountHandle: "",
          followers: "",
        }))
      );
      setSmmFetchStatusByPlatform({});
      fetchUsers();

      setSuccessMessage(
        data.message || "User created successfully. They can sign in immediately."
      );
      setTimeout(() => setSuccessMessage(""), 5000);

      if (followUpErrors.length) {
        setError(`User was created. ${followUpErrors.join(" ")}`);
      }
    } catch (err) {
      setError(err.message);
    }
  };

  const getStatusBadge = (user) => {
    if (user.isActive === false) {
      return {
        label: "Inactive",
        icon: FiEyeOff,
        classes:
          "border-[color-mix(in_srgb,var(--cw-danger)_38%,var(--cw-hairline))] bg-[color-mix(in_srgb,var(--cw-danger)_14%,var(--cw-surface))] text-[var(--cw-danger)]",
      };
    }
    if (!user.emailVerified && user.status === "pending") {
      return {
        label: "Pending",
        icon: FiClock,
        classes:
          "border-[color-mix(in_srgb,var(--cw-caution)_38%,var(--cw-hairline))] bg-[color-mix(in_srgb,var(--cw-caution)_14%,var(--cw-surface))] text-[var(--cw-caution)]",
      };
    }
    return {
      label: "Active",
      icon: FiCheckCircle,
      classes:
        "border-[color-mix(in_srgb,var(--cw-neon)_38%,var(--cw-hairline))] bg-[color-mix(in_srgb,var(--cw-neon)_14%,var(--cw-surface))] text-[var(--cw-neon)]",
    };
  };

  const filteredUsers = users.filter((user) => {
    if (roleFilter !== "all" && (user.role || "user") !== roleFilter) return false;
    const searchLower = searchTerm.toLowerCase();
    return (
      user.email.toLowerCase().includes(searchLower) ||
      (user.name && user.name.toLowerCase().includes(searchLower)) ||
      (user.role && user.role.toLowerCase().includes(searchLower))
    );
  }).sort((a, b) => {
    if (a.role === ROLES.SUPER_ADMIN && b.role !== ROLES.SUPER_ADMIN) return -1;
    if (a.role !== ROLES.SUPER_ADMIN && b.role === ROLES.SUPER_ADMIN) return 1;
    return (a.name || a.email || "").localeCompare(b.name || b.email || "");
  });

  const userStats = {
    total: users.length,
    active: users.filter((u) => u.isActive !== false).length,
    pending: users.filter((u) => u.isActive !== false && !u.emailVerified && u.status === "pending")
      .length,
    inactive: users.filter((u) => u.isActive === false).length,
  };

  const USERS_PER_PAGE = 12;
  const totalPages = Math.max(1, Math.ceil(filteredUsers.length / USERS_PER_PAGE));
  const paginatedUsers = filteredUsers.slice(
    (currentPage - 1) * USERS_PER_PAGE,
    currentPage * USERS_PER_PAGE
  );

  const roleMeta = (role) =>
    ROLE_META[role] || {
      label: role || "user",
      pill: "border-[var(--cw-hairline-strong)] bg-[var(--cw-overlay)] text-[var(--cw-ink-dim)]",
    };

  const getUserSiteLabels = (user) => {
    const sites = Array.isArray(user.accessibleSites)
      ? user.accessibleSites.map((s) => (typeof s === "string" ? s : s.siteLink)).filter(Boolean)
      : [];
    const multiSite =
      user.role === ROLES.VIEWER || user.role === ROLES.SMM || user.role === ROLES.APPROVER;
    if (multiSite && sites.length) return sites;
    return user.siteLink ? [user.siteLink] : [];
  };

  const integrationSiteKeys = (integration) =>
    [integration.siteLink, integration.facebookPageId].filter(Boolean);

  const integrationIsAssigned = (integration, assignedSites = []) => {
    const keys = new Set((assignedSites || []).map(String));
    return integrationSiteKeys(integration).some((key) => keys.has(key));
  };

  const showFullUserSetup = Boolean(
    (!editingUser || (editingUser && editingUser.role !== ROLES.SUPER_ADMIN)) && showAdvancedSettings
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-[var(--cw-neon)] border-t-transparent" />
          <p className="mt-3 text-sm text-[var(--cw-ink-muted)]">Loading users…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between" data-guide="admin-users">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--cw-neon)]">
            Admin
          </p>
          <h1 className="mt-1 font-heading text-3xl tracking-tight text-[var(--cw-ink)]">Console</h1>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-[var(--cw-ink-muted)]">
            People and access, report delivery, data sources and the scheduled jobs behind them.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={syncMetaPages}
            disabled={syncingMetaPages}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-[color-mix(in_srgb,var(--cw-neon)_40%,var(--cw-hairline))] bg-[color-mix(in_srgb,var(--cw-neon)_10%,var(--cw-raised))] px-4 py-2.5 text-sm font-semibold text-[var(--cw-neon)] transition-smooth hover:bg-[color-mix(in_srgb,var(--cw-neon)_16%,var(--cw-raised))] disabled:opacity-45"
          >
            <FiRefreshCw className={`h-4 w-4 ${syncingMetaPages ? "animate-spin" : ""}`} />
            {syncingMetaPages ? "Fetching Meta pages…" : "Fetch Meta pages"}
          </button>
          <button
            onClick={() => setShowSiteAssociations(true)}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-[var(--cw-hairline)] bg-[var(--cw-raised)] px-4 py-2.5 text-sm font-semibold text-[var(--cw-ink-dim)] transition-smooth hover:border-[color-mix(in_srgb,var(--cw-neon)_40%,var(--cw-hairline))] hover:bg-[var(--cw-overlay)] hover:text-[var(--cw-ink)]"
          >
            <FiLink className="h-4 w-4" />
            Manage sites &amp; tracking
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-[color-mix(in_srgb,var(--cw-danger)_38%,var(--cw-hairline))] bg-[color-mix(in_srgb,var(--cw-danger)_12%,var(--cw-surface))] px-4 py-3 text-sm text-[var(--cw-danger)]">
          <FiAlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {successMessage && (
        <div className="flex items-start gap-2 rounded-xl border border-[color-mix(in_srgb,var(--cw-neon)_38%,var(--cw-hairline))] bg-[color-mix(in_srgb,var(--cw-neon)_12%,var(--cw-surface))] px-4 py-3 text-sm text-[var(--cw-neon)]">
          <FiCheckCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{successMessage}</span>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-1.5 rounded-2xl border border-[var(--cw-hairline)] bg-[var(--cw-surface)] p-1.5" data-guide="admin-access">
        {ADMIN_TABS.map((tab) => {
          const Icon = tab.icon;
          const active = adminTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setAdminTab(tab.id)}
              aria-current={active ? "page" : undefined}
              className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition-smooth ${
                active
                  ? "bg-[var(--cw-neon)] text-[var(--cw-neon-ink)]"
                  : "text-[var(--cw-ink-dim)] hover:bg-[var(--cw-overlay)] hover:text-[var(--cw-ink)]"
              }`}
            >
              <Icon className="h-4 w-4" />
              {tab.label}
              {tab.id === "people" && (
                <span
                  className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold tabular-nums ${
                    active
                      ? "bg-[color-mix(in_srgb,var(--cw-neon-ink)_18%,transparent)] text-[var(--cw-neon-ink)]"
                      : "bg-[var(--cw-overlay)] text-[var(--cw-ink-muted)]"
                  }`}
                >
                  {userStats.total}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {adminTab === "people" && (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[
              { label: "Total accounts", value: userStats.total, tone: "text-[var(--cw-ink)]" },
              { label: "Active", value: userStats.active, tone: "text-[var(--cw-neon)]" },
              { label: "Pending", value: userStats.pending, tone: "text-[var(--cw-caution)]" },
              { label: "Inactive", value: userStats.inactive, tone: "text-[var(--cw-danger)]" },
            ].map((stat) => (
              <div key={stat.label} className={`${cardClass} px-4 py-3`}>
                <p className={labelClass}>{stat.label}</p>
                <p className={`font-heading text-2xl tabular-nums ${stat.tone}`}>{stat.value}</p>
              </div>
            ))}
          </div>

          <div className={`${cardClass} overflow-hidden`}>
            <div className="flex flex-col gap-3 border-b border-[var(--cw-hairline)] px-4 py-4 sm:px-5 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h2 className="font-heading text-lg tracking-tight text-[var(--cw-ink)]">
                  All users
                </h2>
                <p className="mt-0.5 text-xs text-[var(--cw-ink-muted)]">
                  {filteredUsers.length}
                  {filteredUsers.length === 1 ? " account" : " accounts"} match
                  {filteredUsers.length === 1 ? "es" : ""} the current filter
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative">
                  <FiSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--cw-ink-faint)]" />
                  <input
                    type="text"
                    placeholder="Search name, email or role"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full rounded-xl border border-[var(--cw-hairline)] bg-[var(--cw-raised)] py-2 pl-9 pr-3 text-sm text-[var(--cw-ink)] transition-smooth placeholder:text-[var(--cw-ink-faint)] focus:border-[var(--cw-neon)] focus:outline-none focus:ring-2 focus:ring-[color-mix(in_srgb,var(--cw-neon)_28%,transparent)] sm:w-64"
                  />
                </div>
                <select
                  value={roleFilter}
                  onChange={(e) => setRoleFilter(e.target.value)}
                  aria-label="Filter by role"
                  className="rounded-xl border border-[var(--cw-hairline)] bg-[var(--cw-raised)] px-3 py-2 text-sm font-semibold text-[var(--cw-ink-dim)] transition-smooth focus:border-[var(--cw-neon)] focus:outline-none focus:ring-2 focus:ring-[color-mix(in_srgb,var(--cw-neon)_28%,transparent)]"
                >
                  {ROLE_FILTERS.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={fetchUsers}
                  title="Reload users"
                  aria-label="Reload users"
                  className="inline-flex items-center justify-center rounded-xl border border-[var(--cw-hairline)] bg-[var(--cw-raised)] p-2.5 text-[var(--cw-ink-muted)] transition-smooth hover:bg-[var(--cw-overlay)] hover:text-[var(--cw-ink)]"
                >
                  <FiRefreshCw className="h-4 w-4" />
                </button>
                <button
                  onClick={() => {
                    setShowCreateModal(true);
                    setEditingUser(null);
                    setShowAdvancedSettings(false);
                    setFormData({
                      ...EMPTY_USER_FORM,
                      modulePermissions: getDefaultModulePermissionsForRole("user"),
                    });
                    setSiteIntegrationForm({
                      userId: "",
                      siteUrl: "",
                      propertyId: "",
                      emailOrVerification: "",
                    });
                    setIntegrationPreview(null);
                    setSmmBaselines(
                      DEFAULT_SMM_BASELINES.map((row) => ({
                        ...row,
                        accountHandle: "",
                        followers: "",
                      }))
                    );
                    setSmmFetchStatusByPlatform({});
                  }}
                  className="inline-flex items-center gap-2 rounded-xl bg-[var(--cw-neon)] px-4 py-2.5 text-sm font-semibold text-[var(--cw-neon-ink)] transition-smooth hover:bg-[var(--cw-neon-deep)]"
                  data-guide="admin-invite"
                >
                  <FiUserPlus className="h-4 w-4" />
                  Add user
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] text-left text-sm">
                <thead>
                  <tr className="bg-[var(--cw-raised)] text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--cw-ink-faint)]">
                    <th className="px-4 py-3 sm:px-5">User</th>
                    <th className="px-4 py-3">Role</th>
                    <th className="px-4 py-3">Sites</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right sm:px-5">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedUsers.length === 0 ? (
                    <tr>
                      <td colSpan="5" className="px-4 py-16 text-center">
                        <FiUsers className="mx-auto h-8 w-8 text-[var(--cw-ink-faint)]" />
                        <p className="mt-3 text-sm font-semibold text-[var(--cw-ink-dim)]">
                          No users match this view
                        </p>
                        <p className="mt-1 text-xs text-[var(--cw-ink-muted)]">
                          Try a different search term or role filter.
                        </p>
                      </td>
                    </tr>
                  ) : (
                    paginatedUsers.map((user) => {
                      const role = roleMeta(user.role);
                      const badge = getStatusBadge(user);
                      const BadgeIcon = badge.icon;
                      const sites = getUserSiteLabels(user);
                      const isSelf = user.id === session?.user?.id;
                      return (
                        <tr
                          key={user.id}
                          className="border-t border-[var(--cw-hairline)] align-middle transition-smooth hover:bg-[var(--cw-raised)]"
                        >
                          <td className="px-4 py-3 sm:px-5">
                            <div className="flex items-center gap-3">
                              <span
                                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[color-mix(in_srgb,var(--cw-neon)_25%,var(--cw-hairline))] bg-[color-mix(in_srgb,var(--cw-neon)_12%,var(--cw-surface))] text-xs font-bold text-[var(--cw-neon)]"
                                aria-hidden="true"
                              >
                                {userInitials(user)}
                              </span>
                              <div className="min-w-0">
                                <p className="flex items-center gap-1.5 truncate text-sm font-semibold text-[var(--cw-ink)]">
                                  {user.name || "No name"}
                                  {isSelf && (
                                    <span className="rounded bg-[var(--cw-overlay)] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-[var(--cw-ink-muted)]">
                                      You
                                    </span>
                                  )}
                                </p>
                                <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-[var(--cw-ink-muted)]">
                                  <FiMail className="h-3 w-3 shrink-0" />
                                  {user.email}
                                </p>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${role.pill}`}
                            >
                              {user.role === ROLES.SUPER_ADMIN && <FiShield className="h-3 w-3" />}
                              {role.label}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            {!sites.length ? (
                              <span className="text-xs text-[var(--cw-ink-faint)]">No site assigned</span>
                            ) : sites.length === 1 ? (
                              <span className="flex items-center gap-1.5 text-sm text-[var(--cw-ink-dim)]">
                                <FiLink className="h-3.5 w-3.5 shrink-0 text-[var(--cw-ink-faint)]" />
                                <span className="max-w-[220px] truncate">{sites[0]}</span>
                              </span>
                            ) : (
                              <div>
                                <p className="text-xs font-semibold text-[var(--cw-ink-dim)]">
                                  {sites.length} assigned sites
                                </p>
                                <p className="mt-0.5 max-w-[220px] truncate text-xs text-[var(--cw-ink-muted)]">
                                  {sites.slice(0, 2).join(", ")}
                                </p>
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${badge.classes}`}
                            >
                              <BadgeIcon className="h-3 w-3" />
                              {badge.label}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right sm:px-5">
                            <div className="relative inline-block text-left">
                              <button
                                onClick={() =>
                                  setActiveActionMenuUserId((prev) =>
                                    prev === user.id ? null : user.id
                                  )
                                }
                                className="rounded-lg p-2 text-[var(--cw-ink-muted)] transition-smooth hover:bg-[var(--cw-overlay)] hover:text-[var(--cw-ink)]"
                                aria-label="Open actions"
                              >
                                <FiMoreVertical className="h-4 w-4" />
                              </button>
                              {activeActionMenuUserId === user.id && (
                                <div className="absolute right-0 z-20 mt-2 w-44 overflow-hidden rounded-xl border border-[var(--cw-hairline)] bg-[var(--cw-overlay)] shadow-[var(--cw-shadow-lg)]">
                                  <button
                                    onClick={() => {
                                      setActiveActionMenuUserId(null);
                                      handleEdit(user);
                                    }}
                                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-[var(--cw-ink-dim)] transition-smooth hover:bg-[var(--cw-raised)] hover:text-[var(--cw-ink)]"
                                  >
                                    <FiEdit className="h-3.5 w-3.5" />
                                    Edit details
                                  </button>
                                  <button
                                    onClick={() => {
                                      setActiveActionMenuUserId(null);
                                      handleEdit(user);
                                    }}
                                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-[var(--cw-ink-dim)] transition-smooth hover:bg-[var(--cw-raised)] hover:text-[var(--cw-ink)]"
                                  >
                                    <FiShield className="h-3.5 w-3.5" />
                                    Change permissions
                                  </button>
                                  {!isSelf && (
                                    <button
                                      onClick={() => {
                                        setActiveActionMenuUserId(null);
                                        handleDeleteUser(user.id);
                                      }}
                                      className="flex w-full items-center gap-2 border-t border-[var(--cw-hairline)] px-3 py-2 text-left text-sm text-[var(--cw-danger)] transition-smooth hover:bg-[color-mix(in_srgb,var(--cw-danger)_14%,var(--cw-surface))]"
                                    >
                                      <FiTrash2 className="h-3.5 w-3.5" />
                                      Delete user
                                    </button>
                                  )}
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-1.5 border-t border-[var(--cw-hairline)] px-4 py-3 text-sm">
                <button
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[var(--cw-ink-muted)] transition-smooth hover:bg-[var(--cw-overlay)] hover:text-[var(--cw-ink)] disabled:pointer-events-none disabled:opacity-40"
                >
                  <FiChevronLeft className="h-4 w-4" />
                  Back
                </button>
                {Array.from({ length: Math.min(5, totalPages) }).map((_, idx) => {
                  const page = idx + 1;
                  const active = currentPage === page;
                  return (
                    <button
                      key={page}
                      onClick={() => setCurrentPage(page)}
                      className={`h-8 w-8 rounded-lg text-xs font-bold tabular-nums transition-smooth ${
                        active
                          ? "bg-[var(--cw-neon)] text-[var(--cw-neon-ink)]"
                          : "text-[var(--cw-ink-muted)] hover:bg-[var(--cw-overlay)] hover:text-[var(--cw-ink)]"
                      }`}
                    >
                      {page}
                    </button>
                  );
                })}
                {totalPages > 5 && (
                  <span className="px-1 text-xs text-[var(--cw-ink-faint)]">… {totalPages}</span>
                )}
                <button
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[var(--cw-ink-muted)] transition-smooth hover:bg-[var(--cw-overlay)] hover:text-[var(--cw-ink)] disabled:pointer-events-none disabled:opacity-40"
                >
                  Next
                  <FiChevronRight className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {adminTab === "reports" && (
        <div className="space-y-4">
          <div className="rounded-xl border border-[color-mix(in_srgb,var(--cw-info)_32%,var(--cw-hairline))] bg-[color-mix(in_srgb,var(--cw-info)_10%,var(--cw-surface))] px-4 py-3 text-sm text-[var(--cw-ink-dim)]">
            Deck filters (hide slides/stats) and downloads live under{" "}
            <span className="font-semibold text-[var(--cw-ink)]">Reports → Report Studio</span>.
            Delivery controls below still work; they send each site using that site&apos;s saved studio
            template.
          </div>
          <ReportsManagementPanel />
        </div>
      )}

      {adminTab === "sources" && (
        <div className="space-y-4" data-guide="admin-sources">
          <DataSourcesPanel />
          <SeoDigestSettingsPanel />
        </div>
      )}

      {adminTab === "automation" && (
        <div data-guide="admin-jobs">
          <CronJobsPanel onNavigate={onNavigate} />
        </div>
      )}

      {/* Create/Edit Modal — portaled so section transforms cannot clip it */}
      {portalReady && (showCreateModal || editingUser)
        ? createPortal(
            <div
              className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
              role="dialog"
              aria-modal="true"
              aria-labelledby="user-modal-title"
              onClick={closeUserModal}
            >
              <div
                className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-[var(--cw-hairline)] bg-[var(--cw-surface)] shadow-[var(--cw-shadow-lg)]"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex shrink-0 items-center justify-between gap-3 border-b border-[var(--cw-hairline)] px-6 py-5">
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--cw-neon)]">
                      {editingUser ? "Edit account" : "New account"}
                    </p>
                    <h3
                      id="user-modal-title"
                      className="mt-1 font-heading text-xl tracking-tight text-[var(--cw-ink)]"
                    >
                      {editingUser ? formData.name || formData.email || "Edit user" : "Create user"}
                    </h3>
                  </div>
                  <button
                    type="button"
                    onClick={closeUserModal}
                    className="rounded-lg p-2 text-[var(--cw-ink-muted)] transition-smooth hover:bg-[var(--cw-overlay)] hover:text-[var(--cw-ink)]"
                    aria-label="Close"
                  >
                    <FiX className="h-5 w-5" />
                  </button>
                </div>
                <form
                  id="admin-user-form"
                  onSubmit={editingUser ? handleUpdateUser : handleCreateUser}
                  className="min-h-0 flex-1 space-y-4 overflow-y-auto p-6"
                >
              <div>
                <label className={labelClass}>Email</label>
                <input
                  type="email"
                  required={!editingUser}
                  disabled={!!editingUser}
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className={fieldClass}
                />
              </div>

              {!editingUser ? (
                <div>
                  <label className={labelClass}>Password</label>
                  <input
                    type="password"
                    required
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    className={fieldClass}
                  />
                </div>
              ) : (
                <div>
                  <label className={labelClass}>New password (optional)</label>
                  <input
                    type="password"
                    autoComplete="new-password"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    placeholder="Leave blank to keep current password"
                    className={fieldClass}
                  />
                  <p className="mt-1.5 text-xs text-[var(--cw-ink-muted)]">
                    Only fill this in if you want to reset the user&apos;s password.
                  </p>
                </div>
              )}

              <div>
                <label className={labelClass}>Name</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className={fieldClass}
                />
              </div>

              <div>
                <label className={labelClass}>Role</label>
                <select
                  value={formData.role}
                  onChange={(e) => {
                    const role = e.target.value;
                    setFormData({
                      ...formData,
                      role,
                      modulePermissions: coerceModulePermissionsForForm(null, role),
                      ...getDefaultReportPreferencesForRole(role),
                    });
                  }}
                  disabled={editingUser?.role === ROLES.SUPER_ADMIN}
                  className={fieldClass}
                >
                  {editingUser?.role === ROLES.SUPER_ADMIN && (
                    <option value="super_admin">Super Admin</option>
                  )}
                  <option value="user">User</option>
                  <option value="viewer">Viewer (Read-only)</option>
                  <option value="smm">SMM (Social media manager)</option>
                  <option value="approver">Approver (SMM Approvals)</option>
                </select>
              </div>

              {(!editingUser || editingUser.role !== ROLES.SUPER_ADMIN) && (
                <ModulePermissionPicker
                  value={formData.modulePermissions}
                  onChange={(modulePermissions) => setFormData({ ...formData, modulePermissions })}
                  role={formData.role}
                />
              )}

              <div className="col-span-1 space-y-3 rounded-xl border border-[var(--cw-hairline)] bg-[var(--cw-raised)] p-4 md:col-span-2">
                <div>
                  <p className="text-sm font-bold text-[var(--cw-ink)]">Reports</p>
                  <p className="mt-0.5 text-xs text-[var(--cw-ink-muted)]">
                    Weekly digests and client PDFs for this user&apos;s assigned sites. Super admins always
                    receive all reports.
                  </p>
                </div>
                <label className="flex cursor-pointer items-start gap-2.5 text-sm text-[var(--cw-ink-dim)]">
                  <input
                    type="checkbox"
                    checked={Boolean(formData.weeklyDigestEnabled)}
                    onChange={(e) => setFormData({ ...formData, weeklyDigestEnabled: e.target.checked })}
                    className={`mt-0.5 ${checkboxClass}`}
                  />
                  <span>
                    <span className="font-semibold text-[var(--cw-ink)]">Weekly staff digest</span>
                    <span className="block text-xs text-[var(--cw-ink-muted)]">
                      Site-scoped website + social performance deck emailed Mondays
                    </span>
                  </span>
                </label>
                <label className="flex cursor-pointer items-start gap-2.5 text-sm text-[var(--cw-ink-dim)]">
                  <input
                    type="checkbox"
                    checked={Boolean(formData.receiveWebsiteReport)}
                    onChange={(e) => setFormData({ ...formData, receiveWebsiteReport: e.target.checked })}
                    className={`mt-0.5 ${checkboxClass}`}
                  />
                  <span>
                    <span className="font-semibold text-[var(--cw-ink)]">Website monthly report</span>
                    <span className="block text-xs text-[var(--cw-ink-muted)]">
                      GSC, keywords, backlinks, audit, audience map
                    </span>
                  </span>
                </label>
                <label className="flex cursor-pointer items-start gap-2.5 text-sm text-[var(--cw-ink-dim)]">
                  <input
                    type="checkbox"
                    checked={Boolean(formData.receiveSmmReport)}
                    onChange={(e) => setFormData({ ...formData, receiveSmmReport: e.target.checked })}
                    className={`mt-0.5 ${checkboxClass}`}
                  />
                  <span>
                    <span className="font-semibold text-[var(--cw-ink)]">Social media monthly report</span>
                    <span className="block text-xs text-[var(--cw-ink-muted)]">
                      Platform KPIs and content performance
                    </span>
                  </span>
                </label>
                <label className="flex cursor-pointer items-start gap-2.5 text-sm text-[var(--cw-ink-dim)]">
                  <input
                    type="checkbox"
                    checked={Boolean(formData.receiveCombinedReport)}
                    onChange={(e) => setFormData({ ...formData, receiveCombinedReport: e.target.checked })}
                    className={`mt-0.5 ${checkboxClass}`}
                  />
                  <span>
                    <span className="font-semibold text-[var(--cw-ink)]">Combined deck</span>
                    <span className="block text-xs text-[var(--cw-ink-muted)]">
                      One PDF with website + social. Each checked report type is emailed as its own attachment.
                    </span>
                  </span>
                </label>
              </div>

              {(!editingUser || (editingUser && editingUser.role !== ROLES.SUPER_ADMIN)) && (
                <div className="col-span-1 rounded-xl border border-[color-mix(in_srgb,var(--cw-neon)_22%,var(--cw-hairline))] bg-[color-mix(in_srgb,var(--cw-neon)_8%,var(--cw-surface))] p-4 md:col-span-2">
                  <label className="mb-1 block text-sm font-bold text-[var(--cw-ink)]">
                    Link Meta account (Facebook &amp; Instagram)
                  </label>
                  <p className="mb-3 text-xs text-[var(--cw-ink-muted)]">
                    Select a Facebook Page linked to your Meta token. Use Fetch Meta pages on this
                    screen if the list is empty, then the pages also appear as projects.
                  </p>

                  {loadingMetaAccounts ? (
                    <div className="animate-pulse text-xs text-[var(--cw-ink-muted)]">
                      Loading connected Meta accounts…
                    </div>
                  ) : metaAccounts.length > 0 ? (
                    <div className="space-y-2">
                      {metaAccountsError ? (
                        <div className="rounded-lg border border-[color-mix(in_srgb,var(--cw-caution)_35%,var(--cw-hairline))] bg-[color-mix(in_srgb,var(--cw-caution)_12%,var(--cw-surface))] p-2 text-xs text-[var(--cw-caution)]">
                          {metaAccountsError}
                        </div>
                      ) : null}
                      <select
                        value={formData.facebookPageId || ""}
                        onChange={(e) => {
                          const selectedPageId = e.target.value;
                          const account = metaAccounts.find(a => a.facebookPageId === selectedPageId);

                          setFormData({
                            ...formData,
                            facebookPageId: selectedPageId,
                            instagramUserId: account ? account.instagramUserId : ""
                          });
                        }}
                        className={fieldClass}
                      >
                        <option value="">-- Select a Meta Account --</option>
                        {metaAccounts.map((acc) => (
                          <option key={acc.facebookPageId} value={acc.facebookPageId}>
                            {acc.name || acc.facebookPageId}{" "}
                            {acc.instagramUserId ? "(Includes Instagram)" : "(Facebook Only)"}
                            {acc.source === "database" ? " · saved" : ""}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : (
                    <div className="space-y-1.5 rounded-lg border border-[color-mix(in_srgb,var(--cw-caution)_35%,var(--cw-hairline))] bg-[color-mix(in_srgb,var(--cw-caution)_12%,var(--cw-surface))] p-3 text-xs text-[var(--cw-ink-dim)]">
                      <p className="font-semibold text-[var(--cw-caution)]">
                        {metaAccountsError || "No Meta accounts found."}
                      </p>
                      <p>
                        On Render, set <code className="font-mono text-[var(--cw-ink)]">META_PAGE_ACCESS_TOKEN</code>{" "}
                        (Page or System User token from Meta for Developers), save, and restart the service. You can
                        also type a Facebook Page ID manually below if needed.
                      </p>
                      <button
                        type="button"
                        onClick={syncMetaPages}
                        disabled={syncingMetaPages}
                        className="mt-2 inline-flex items-center gap-2 rounded-lg border border-[color-mix(in_srgb,var(--cw-neon)_40%,var(--cw-hairline))] bg-[color-mix(in_srgb,var(--cw-neon)_10%,var(--cw-surface))] px-3 py-1.5 text-xs font-semibold text-[var(--cw-neon)] disabled:opacity-45"
                      >
                        <FiRefreshCw className={`h-3.5 w-3.5 ${syncingMetaPages ? "animate-spin" : ""}`} />
                        {syncingMetaPages ? "Fetching…" : "Fetch Meta pages"}
                      </button>
                      <div className="pt-1">
                        <label className="mb-1 block text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--cw-ink-faint)]">
                          Facebook Page ID (manual)
                        </label>
                        <input
                          type="text"
                          value={formData.facebookPageId || ""}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              facebookPageId: e.target.value.trim(),
                            })
                          }
                          placeholder="e.g. 123456789012345"
                          className={fieldClass}
                        />
                      </div>
                      <div className="pt-1">
                        <label className="mb-1 block text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--cw-ink-faint)]">
                          Instagram User ID (optional)
                        </label>
                        <input
                          type="text"
                          value={formData.instagramUserId || ""}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              instagramUserId: e.target.value.trim(),
                            })
                          }
                          placeholder="Optional Instagram business account ID"
                          className={fieldClass}
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}

              {(formData.role === "smm" || formData.role === "approver" || formData.role === "viewer") && (
                <div className="col-span-1 space-y-3 rounded-xl border border-[var(--cw-hairline)] bg-[var(--cw-raised)] p-4 md:col-span-2">
                  <label className="block text-sm font-bold text-[var(--cw-ink)]">
                    Assign accessible projects
                  </label>
                  <p className="text-xs text-[var(--cw-ink-muted)]">
                    Select the projects this user is allowed to access and manage.
                  </p>
                  {availableIntegrations.length > 0 ? (
                    <div className="max-h-48 space-y-1 overflow-y-auto rounded-lg border border-[var(--cw-hairline)] bg-[var(--cw-surface)] p-2">
                      {availableIntegrations.map((integration) => {
                        const val = integration.facebookPageId || integration.siteLink;
                        const metaMatch = metaAccounts.find((a) => a.facebookPageId === val);
                        const label = metaMatch ? metaMatch.name : integration.userName || val;
                        const isChecked = integrationIsAssigned(integration, formData.accessibleSites);
                        return (
                          <label
                            key={val}
                            className={`flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 transition-smooth ${
                              isChecked
                                ? "bg-[color-mix(in_srgb,var(--cw-neon)_12%,var(--cw-surface))]"
                                : "hover:bg-[var(--cw-overlay)]"
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={(e) => {
                                const toggleKeys = integrationSiteKeys(integration);
                                const current = formData.accessibleSites || [];
                                const nextList = e.target.checked
                                  ? [...new Set([...current, ...toggleKeys])]
                                  : current.filter((x) => !toggleKeys.includes(x));
                                setFormData({ ...formData, accessibleSites: nextList });
                              }}
                              className={checkboxClass}
                            />
                            <span
                              className={`truncate text-sm ${
                                isChecked
                                  ? "font-semibold text-[var(--cw-ink)]"
                                  : "text-[var(--cw-ink-dim)]"
                              }`}
                            >
                              {label}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="text-xs text-[var(--cw-ink-muted)]">
                      No integrated sites or Meta pages found.
                    </div>
                  )}
                </div>
              )}

              <div className="border-t border-[var(--cw-hairline)] pt-3">
                <button
                  type="button"
                  onClick={() => setShowAdvancedSettings(!showAdvancedSettings)}
                  className="flex items-center gap-1 text-xs font-bold uppercase tracking-[0.12em] text-[var(--cw-ink-faint)] transition-smooth hover:text-[var(--cw-neon)]"
                >
                  {showAdvancedSettings
                    ? "Hide advanced tracking settings"
                    : "Show advanced tracking settings (site link)"}
                </button>
              </div>

              {showFullUserSetup && (
                <div className="space-y-4 pt-1">
                  <div className="rounded-xl border border-[color-mix(in_srgb,var(--cw-info)_32%,var(--cw-hairline))] bg-[color-mix(in_srgb,var(--cw-info)_10%,var(--cw-surface))] p-4">
                    <div className="flex items-start gap-2">
                      <FiAlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--cw-info)]" />
                      <p className="text-sm text-[var(--cw-ink-dim)]">
                        <span className="font-semibold text-[var(--cw-ink)]">Heads up:</span> Tracking IDs
                        (GTM, Facebook, Instagram) are now configured globally in the{" "}
                        <button
                          type="button"
                          onClick={() => setShowSiteAssociations(true)}
                          className="font-semibold text-[var(--cw-neon)] underline transition-smooth hover:text-[var(--cw-neon-soft)]"
                        >
                          Manage sites &amp; tracking
                        </button>{" "}
                        modal. You only need to set the Site Link here for this user.
                      </p>
                    </div>
                  </div>
                  <div>
                    <label className={labelClass}>Site link</label>
                    <input
                      type="url"
                      value={formData.siteLink}
                      onChange={(e) => {
                        const v = e.target.value;
                        setFormData((prev) => ({ ...prev, siteLink: v }));
                        setSiteIntegrationForm((prev) => ({ ...prev, siteUrl: v }));
                      }}
                      placeholder="https://example.com"
                      className={fieldClass}
                    />
                  </div>
                </div>
              )}

              {showFullUserSetup && (
                <div className="space-y-3 rounded-xl border border-[var(--cw-hairline)] bg-[var(--cw-raised)] p-4">
                  <p className="text-sm font-bold text-[var(--cw-ink)]">Site integration</p>
                  {!editingUser && (
                    <p className="text-xs text-[var(--cw-ink-muted)]">
                      If you fill Site URL or Property ID, integration is saved automatically when you click Create.
                    </p>
                  )}
                  <div>
                    <label className={labelClass}>
                      User name / email (optional for verification)
                    </label>
                    <input
                      type="text"
                      value={siteIntegrationForm.emailOrVerification}
                      onChange={(e) =>
                        setSiteIntegrationForm((prev) => ({ ...prev, emailOrVerification: e.target.value }))
                      }
                      placeholder={
                        editingUser?.email ||
                        formData.email ||
                        "user@example.com or google-site-verification=..."
                      }
                      className={fieldClass}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Site URL</label>
                    <input
                      type="url"
                      value={siteIntegrationForm.siteUrl}
                      onChange={(e) => {
                        const v = e.target.value;
                        setSiteIntegrationForm((prev) => ({ ...prev, siteUrl: v }));
                        setFormData((prev) => ({ ...prev, siteLink: v }));
                      }}
                      placeholder="https://example.com"
                      className={fieldClass}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Property ID</label>
                    <input
                      type="text"
                      value={siteIntegrationForm.propertyId}
                      onChange={(e) =>
                        setSiteIntegrationForm((prev) => ({ ...prev, propertyId: e.target.value }))
                      }
                      placeholder="sc-domain:example.com"
                      className={fieldClass}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleSaveSiteIntegrationForUser}
                    disabled={integratingSite || !editingUser}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--cw-neon)] px-4 py-2.5 text-sm font-semibold text-[var(--cw-neon-ink)] transition-smooth hover:bg-[var(--cw-neon-deep)] disabled:opacity-50"
                  >
                    <FiSave className="h-4 w-4" />
                    {integratingSite ? "Saving…" : "Save integration"}
                  </button>
                  {integrationPreview && (
                    <div className="grid grid-cols-2 gap-2 pt-1 text-sm">
                      {[
                        { label: "Clicks", value: integrationPreview.totalClicks },
                        { label: "Impressions", value: integrationPreview.totalImpressions },
                        { label: "Avg CTR", value: `${(integrationPreview.averageCtr * 100).toFixed(2)}%` },
                        { label: "Avg position", value: integrationPreview.averagePosition.toFixed(1) },
                      ].map((stat) => (
                        <div
                          key={stat.label}
                          className="rounded-lg border border-[var(--cw-hairline)] bg-[var(--cw-surface)] px-3 py-2"
                        >
                          <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--cw-ink-faint)]">
                            {stat.label}
                          </p>
                          <p className="mt-0.5 font-semibold tabular-nums text-[var(--cw-ink)]">
                            {stat.value}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="rounded-lg bg-[var(--cw-surface)] px-3 py-2 text-xs text-[var(--cw-ink-muted)]">
                    Send GTM-collected platform metrics to{" "}
                    <span className="font-mono text-[var(--cw-ink-dim)]">/api/smm/collect</span> with this
                    user&apos;s GTM ID and site URL.
                  </div>
                </div>
              )}

              {showFullUserSetup && (
                <div className="space-y-3 rounded-xl border border-[var(--cw-hairline)] bg-[var(--cw-raised)] p-4">
                  <p className="text-sm font-bold text-[var(--cw-ink)]">SMM baseline setup (followers)</p>
                  <p className="text-xs text-[var(--cw-ink-muted)]">
                    Optional quick-start: enter current followers so SMM cards show numbers immediately before GTM events start.
                  </p>
                  {!editingUser && (
                    <p className="text-xs text-[var(--cw-ink-muted)]">
                      Baseline values are saved when you click Create (needs Site Link or integrated site URL). Use Edit
                      after creation to fetch counts from handles.
                    </p>
                  )}
                  {loadingSmmBaseline && (
                    <p className="text-xs text-[var(--cw-ink-faint)]">Loading saved SMM baseline…</p>
                  )}
                  {smmBaselines.map((row) => (
                    <div key={row.platform} className="space-y-1.5">
                      <div className="grid grid-cols-1 md:grid-cols-[120px_1fr_140px] gap-2">
                      <div className="flex items-center rounded-xl border border-[var(--cw-hairline)] bg-[var(--cw-surface)] px-3 py-2 text-sm font-semibold text-[var(--cw-ink-dim)]">
                        {SMM_BASELINE_PLATFORM_LABEL[row.platform] || row.platform}
                      </div>
                      <input
                        type="text"
                        value={row.accountHandle}
                        onChange={(e) => handleSmmBaselineChange(row.platform, "accountHandle", e.target.value)}
                        placeholder={
                          row.platform === "tiktok"
                            ? "@tiktokuser or https://www.tiktok.com/@user"
                            : "@handle or profile link (optional)"
                        }
                        className={fieldClass}
                      />
                      <input
                        type="number"
                        min="0"
                        value={row.followers}
                        onChange={(e) => handleSmmBaselineChange(row.platform, "followers", e.target.value)}
                        placeholder="Followers"
                        className={fieldClass}
                      />
                      </div>
                      {smmFetchStatusByPlatform[row.platform] && (
                        <div className="flex items-center gap-2 pl-1">
                          <span
                            className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                              smmFetchStatusByPlatform[row.platform].status === "resolved"
                                ? "bg-[color-mix(in_srgb,var(--cw-neon)_16%,var(--cw-surface))] text-[var(--cw-neon)]"
                                : smmFetchStatusByPlatform[row.platform].status === "loading"
                                  ? "bg-[color-mix(in_srgb,var(--cw-info)_16%,var(--cw-surface))] text-[var(--cw-info)]"
                                  : "bg-[color-mix(in_srgb,var(--cw-caution)_16%,var(--cw-surface))] text-[var(--cw-caution)]"
                            }`}
                          >
                            {smmFetchStatusByPlatform[row.platform].status}
                          </span>
                          <span className="text-[11px] text-[var(--cw-ink-muted)]">
                            {smmFetchStatusByPlatform[row.platform].reason}
                          </span>
                        </div>
                      )}
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={handleFetchSmmFromHandles}
                    disabled={fetchingSmmFromHandles || !editingUser}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-[var(--cw-hairline)] bg-[var(--cw-surface)] px-4 py-2.5 text-sm font-semibold text-[var(--cw-ink-dim)] transition-smooth hover:bg-[var(--cw-overlay)] hover:text-[var(--cw-ink)] disabled:opacity-50"
                  >
                    <FiRefreshCw className={`h-4 w-4 ${fetchingSmmFromHandles ? "animate-spin" : ""}`} />
                    {fetchingSmmFromHandles ? "Fetching from handles…" : "Fetch from handles"}
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveSmmBaseline}
                    disabled={savingSmmBaseline || !editingUser}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--cw-neon)] px-4 py-2.5 text-sm font-semibold text-[var(--cw-neon-ink)] transition-smooth hover:bg-[var(--cw-neon-deep)] disabled:opacity-50"
                  >
                    <FiSave className="h-4 w-4" />
                    {savingSmmBaseline ? "Saving baseline…" : "Save SMM baseline"}
                  </button>
                  <p className="text-xs text-[var(--cw-ink-muted)]">
                    Auto-fetch uses YouTube, Meta (Facebook/Instagram), and TikTok (TIKTOK_CLIENT_KEY/SECRET in .env.local). TikTok rows: @handle or tiktok.com profile URL only.
                  </p>
                </div>
              )}

              {editingUser && editingUser.role === ROLES.SUPER_ADMIN && (
                <div className="rounded-xl border border-[var(--cw-hairline)] bg-[var(--cw-raised)] p-4">
                  <p className="text-sm text-[var(--cw-ink-muted)]">
                    Site integration fields are hidden for super admin accounts.
                  </p>
                </div>
              )}

              <div className="rounded-xl border border-[var(--cw-hairline)] bg-[var(--cw-raised)] p-4">
                <label className="flex cursor-pointer items-center gap-2.5">
                  <input
                    type="checkbox"
                    checked={formData.isActive === true}
                    onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                    className={checkboxClass}
                  />
                  <span className="text-sm font-semibold text-[var(--cw-ink)]">Active</span>
                </label>
                {!editingUser && (
                  <p className="mt-1.5 text-xs text-[var(--cw-ink-muted)]">
                    New accounts are ready to sign in immediately (no verification email). Uncheck only if you want
                    this user blocked from logging in.
                  </p>
                )}
              </div>
            </form>
            <div className="flex shrink-0 gap-3 border-t border-[var(--cw-hairline)] bg-[var(--cw-surface)] px-6 py-4">
              <button
                type="submit"
                form="admin-user-form"
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-[var(--cw-neon)] px-4 py-2.5 text-sm font-semibold text-[var(--cw-neon-ink)] transition-smooth hover:bg-[var(--cw-neon-deep)]"
              >
                <FiSave className="h-4 w-4" />
                {editingUser ? "Update user" : "Create user"}
              </button>
              <button
                type="button"
                onClick={closeUserModal}
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl border border-[var(--cw-hairline)] bg-[var(--cw-raised)] px-4 py-2.5 text-sm font-semibold text-[var(--cw-ink-dim)] transition-smooth hover:bg-[var(--cw-overlay)] hover:text-[var(--cw-ink)]"
              >
                <FiX className="h-4 w-4" />
                Cancel
              </button>
            </div>
          </div>
        </div>,
            document.body
          )
        : null}
      <SiteAssociationsModal
        isOpen={showSiteAssociations}
        onClose={() => setShowSiteAssociations(false)}
      />
    </div>
  );
}
