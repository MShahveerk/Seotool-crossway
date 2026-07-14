"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { validatePassword } from "../../lib/validation";
import { 
  FiUserPlus, 
  FiEdit, 
  FiTrash2, 
  FiEye, 
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
  FiFilter
} from "react-icons/fi";

const ROLES = {
  SUPER_ADMIN: "super_admin",
  USER: "user",
  VIEWER: "viewer",
  SMM: "smm",
  APPROVER: "approver",
};

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

export default function AdminSection() {
  const { data: session } = useSession();
  const [users, setUsers] = useState([]);
  const [availableIntegrations, setAvailableIntegrations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [formData, setFormData] = useState({
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
  });
  const [currentPage, setCurrentPage] = useState(1);
  const [activeActionMenuUserId, setActiveActionMenuUserId] = useState(null);
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

  useEffect(() => {
    fetchUsers();
  }, []);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm]);

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
    try {
      const res = await fetch("/api/admin/meta-accounts");
      const data = await res.json();
      if (res.ok && data.accounts) {
        setMetaAccounts(data.accounts);
      }
    } catch (err) {
      console.error("Failed to load Meta accounts", err);
    } finally {
      setLoadingMetaAccounts(false);
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
      };
      if (editingUser?.role !== ROLES.SUPER_ADMIN) {
        payload.role = formData.role;
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

      setEditingUser(null);
      setFormData({
        email: "",
        password: "",
        name: "",
        role: "user",
        siteLink: "",
        gtmContainerId: "",
        facebookPageId: "",
        instagramUserId: "",
        isActive: true,
      });
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

  const handleEdit = (user) => {
    setEditingUser(user);
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
      accessibleSites: Array.isArray(user.accessibleSites) ? user.accessibleSites.map((s) => s.siteLink || s) : [],
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

  const [successMessage, setSuccessMessage] = useState("");

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
      setFormData({
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
        classes: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
      };
    }
    if (!user.emailVerified && user.status === "pending") {
      return {
        label: "Pending verification",
        icon: FiClock,
        classes: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
      };
    }
    return {
      label: "Active",
      icon: FiCheckCircle,
      classes: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
    };
  };

  const filteredUsers = users.filter((user) => {
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

  const USERS_PER_PAGE = 12;
  const totalPages = Math.max(1, Math.ceil(filteredUsers.length / USERS_PER_PAGE));
  const paginatedUsers = filteredUsers.slice(
    (currentPage - 1) * USERS_PER_PAGE,
    currentPage * USERS_PER_PAGE
  );

  const getRoleBadgeColor = (role) => {
    switch (role) {
      case ROLES.SUPER_ADMIN:
        return "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200";
      case ROLES.USER:
        return "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200";
      case ROLES.VIEWER:
        return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200";
      case ROLES.APPROVER:
        return "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200";
      default:
        return "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200";
    }
  };

  const [showAdvancedSettings, setShowAdvancedSettings] = useState(false);

  const showFullUserSetup = Boolean(
    (!editingUser || (editingUser && editingUser.role !== ROLES.SUPER_ADMIN)) && showAdvancedSettings
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <div className="inline-block h-8 w-8 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
          <p className="mt-2 text-sm text-gray-600">Loading users...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Error Message */}
      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-800 dark:text-red-200 px-4 py-3 rounded-xl">
          {error}
        </div>
      )}

      {/* Success Message */}
      {successMessage && (
        <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-800 dark:text-green-200 px-4 py-3 rounded-xl">
          {successMessage}
        </div>
      )}

      {/* Users Table */}
      <div className="rounded-xl border border-gray-200 bg-[#ffffff] overflow-hidden">
        <div className="px-4 sm:px-6 pb-4 border-b border-gray-200 py-5">
          <h2 className="text-2xl font-bold text-gray-900">User Management</h2>
          <p className="text-sm text-gray-600 mt-1">
            Manage users, roles, and site access
          </p>
        </div>
        <div className="px-4 sm:px-6 py-4 border-b border-gray-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="text-sm text-gray-700 font-semibold">All Users <span className="text-gray-500 font-medium">{filteredUsers.length}</span></div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <FiSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <input
                type="text"
                placeholder="Search"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-44 pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-[#0EFF2A] focus:border-transparent"
              />
            </div>
            <button className="inline-flex items-center gap-1 px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 bg-white">
              <FiFilter className="w-4 h-4" />
              Filters
            </button>
            <button
              onClick={() => {
                setShowCreateModal(true);
                setFormData({
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
              className="inline-flex items-center gap-1 px-3 py-2 rounded-lg text-sm bg-black text-white"
            >
              Add user +
            </button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-white border-b border-gray-200">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                  Username
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                  Role
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                  Site Link
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-right text-xs font-semibold text-gray-700 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-300">
              {paginatedUsers.length === 0 ? (
                <tr>
                  <td colSpan="5" className="px-6 py-12 text-center text-gray-500">
                    No users found
                  </td>
                </tr>
              ) : (
                paginatedUsers.map((user) => (
                  <tr key={user.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4">
                      <div>
                        <p className="text-sm font-semibold text-gray-900">
                          {user.name || "No name"}
                        </p>
                        <p className="text-xs text-gray-500">{user.email}</p>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${getRoleBadgeColor(
                          user.role
                        )}`}
                      >
                        {user.role === ROLES.SUPER_ADMIN && <FiShield className="w-3 h-3 mr-1" />}
                        {user.role || "user"}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      {user.siteLink ? (
                        <div className="flex items-center space-x-1 text-sm text-gray-700 dark:text-gray-800">
                          <FiLink className="w-4 h-4" />
                          <span className="truncate max-w-xs">{user.siteLink}</span>
                        </div>
                      ) : (
                        <span className="text-xs text-gray-400">No site assigned</span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      {(() => {
                        const badge = getStatusBadge(user);
                        const BadgeIcon = badge.icon;
                        return (
                          <span
                            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${badge.classes}`}
                          >
                            <BadgeIcon className="w-3 h-3 mr-1" />
                            {badge.label}
                          </span>
                        );
                      })()}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="relative inline-block">
                        <button
                          onClick={() =>
                            setActiveActionMenuUserId((prev) => (prev === user.id ? null : user.id))
                          }
                          className="p-2 rounded-lg hover:bg-gray-100 text-gray-600"
                          aria-label="Open actions"
                        >
                          <FiMoreVertical className="w-4 h-4" />
                        </button>
                        {activeActionMenuUserId === user.id && (
                          <div className="absolute right-0 mt-2 w-44 bg-white border border-gray-200 rounded-lg shadow-lg z-20">
                            <button
                              onClick={() => {
                                setActiveActionMenuUserId(null);
                                handleEdit(user);
                              }}
                              className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50"
                            >
                              View profile
                            </button>
                            <button
                              onClick={() => {
                                setActiveActionMenuUserId(null);
                                handleEdit(user);
                              }}
                              className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50"
                            >
                              Change permission
                            </button>
                            <button
                              onClick={() => {
                                setActiveActionMenuUserId(null);
                                handleEdit(user);
                              }}
                              className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50"
                            >
                              Edit details
                            </button>
                            {user.id !== session?.user?.id && (
                              <button
                                onClick={() => {
                                  setActiveActionMenuUserId(null);
                                  handleDeleteUser(user.id);
                                }}
                                className="w-full text-left px-3 py-2 text-sm text-red-600 hover:bg-red-50"
                              >
                                Delete user
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="px-4 sm:px-6 py-3 border-t border-gray-200 flex items-center justify-center gap-2 text-sm">
          <button
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            disabled={currentPage === 1}
            className="px-2 py-1 text-gray-500 disabled:opacity-40"
          >
            Back
          </button>
          {Array.from({ length: Math.min(5, totalPages) }).map((_, idx) => {
            const page = idx + 1;
            return (
              <button
                key={page}
                onClick={() => setCurrentPage(page)}
                className={`h-7 w-7 rounded ${currentPage === page ? "bg-black text-white" : "text-gray-600 hover:bg-gray-100"}`}
              >
                {page}
              </button>
            );
          })}
          {totalPages > 5 && <span className="text-gray-500">... {totalPages}</span>}
          <button
            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            disabled={currentPage === totalPages}
            className="px-2 py-1 text-gray-500 disabled:opacity-40"
          >
            Next
          </button>
        </div>
      </div>

      {/* Create/Edit Modal */}
      {(showCreateModal || editingUser) && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-50 rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200 dark:border-gray-300">
              <h3 className="text-xl font-bold text-gray-900 dark:text-black">
                {editingUser ? "Edit User" : "Create New User"}
              </h3>
            </div>
            <form
              onSubmit={editingUser ? handleUpdateUser : handleCreateUser}
              className="p-6 space-y-4"
            >
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-800 mb-2">
                  Email
                </label>
                <input
                  type="email"
                  required={!editingUser}
                  disabled={!!editingUser}
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-200 dark:border-gray-300 rounded-xl focus:ring-2 focus:ring-[#0EFF2A] focus:border-transparent bg-white dark:bg-gray-50 text-gray-900 dark:text-black disabled:bg-gray-100 dark:disabled:bg-gray-200"
                />
              </div>

              {!editingUser ? (
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-800 mb-2">
                    Password
                  </label>
                  <input
                    type="password"
                    required
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-200 dark:border-gray-300 rounded-xl focus:ring-2 focus:ring-[#0EFF2A] focus:border-transparent bg-white dark:bg-gray-50 text-gray-900 dark:text-black"
                  />
                </div>
              ) : (
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-800 mb-2">
                    New password (optional)
                  </label>
                  <input
                    type="password"
                    autoComplete="new-password"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    placeholder="Leave blank to keep current password"
                    className="w-full px-4 py-2 border border-gray-200 dark:border-gray-300 rounded-xl focus:ring-2 focus:ring-[#0EFF2A] focus:border-transparent bg-white dark:bg-gray-50 text-gray-900 dark:text-black"
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    Only fill this in if you want to reset the user&apos;s password.
                  </p>
                </div>
              )}

              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-800 mb-2">
                  Name
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-200 dark:border-gray-300 rounded-xl focus:ring-2 focus:ring-[#0EFF2A] focus:border-transparent bg-white dark:bg-gray-50 text-gray-900 dark:text-black"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-800 mb-2">
                  Role
                </label>
                <select
                  value={formData.role}
                  onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                  disabled={editingUser?.role === ROLES.SUPER_ADMIN}
                  className="w-full px-4 py-2 border border-gray-200 dark:border-gray-300 rounded-xl focus:ring-2 focus:ring-[#0EFF2A] focus:border-transparent bg-white dark:bg-gray-50 text-gray-900 dark:text-black"
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

              {(!editingUser || (editingUser && editingUser.role !== ROLES.SUPER_ADMIN)) && (
                <div className="col-span-1 md:col-span-2 rounded-lg border border-[#0EFF2A]/20 bg-[#0EFF2A]/5 p-4 dark:border-[#0EFF2A]/10 dark:bg-[#0EFF2A]/5">
                  <label className="block text-sm font-bold text-gray-800 dark:text-gray-200 mb-2">
                    Link Meta Account (Facebook & Instagram)
                  </label>
                  <p className="text-xs text-gray-600 dark:text-gray-400 mb-3">
                    Select a Facebook Page linked to your Meta Token. This will automatically set the Facebook Page ID and Instagram User ID for publishing.
                  </p>

                  {loadingMetaAccounts ? (
                    <div className="text-xs text-gray-500 animate-pulse">Loading connected Meta accounts...</div>
                  ) : metaAccounts.length > 0 ? (
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
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#0EFF2A] focus:border-transparent bg-white text-gray-900 shadow-sm"
                    >
                      <option value="">-- Select a Meta Account --</option>
                      {metaAccounts.map((acc) => (
                        <option key={acc.facebookPageId} value={acc.facebookPageId}>
                          {acc.name} {acc.instagramUserId ? "(Includes Instagram)" : "(Facebook Only)"}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <div className="text-xs text-amber-600 bg-amber-50 p-2 rounded border border-amber-200">
                      No Meta accounts found. Please ensure <code>META_PAGE_ACCESS_TOKEN</code> is set in your environment variables.
                    </div>
                  )}
                </div>
              )}

              {(formData.role === "smm" || formData.role === "approver" || formData.role === "viewer") && (
                <div className="col-span-1 md:col-span-2 rounded-xl border border-gray-200 p-4 space-y-3 bg-gray-50/50">
                  <label className="block text-sm font-bold text-gray-800 dark:text-gray-900">
                    Assign Accessible Client Sites / Pages
                  </label>
                  <p className="text-xs text-gray-600">
                    Select the client sites or Meta pages this user is allowed to access and manage.
                  </p>
                  {availableIntegrations.length > 0 ? (
                    <div className="space-y-2 max-h-48 overflow-y-auto border border-gray-200 rounded-lg p-3 bg-white">
                      {availableIntegrations.map((integration) => {
                        const val = integration.facebookPageId || integration.siteLink;
                        const metaMatch = metaAccounts.find(a => a.facebookPageId === val);
                        const label = metaMatch ? metaMatch.name : (integration.userName || val);
                        const isChecked = (formData.accessibleSites || []).includes(val);
                        return (
                          <label key={val} className="flex items-center space-x-2.5 py-1 hover:bg-gray-50 rounded px-1.5 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={(e) => {
                                const nextList = e.target.checked
                                  ? [...(formData.accessibleSites || []), val]
                                  : (formData.accessibleSites || []).filter((x) => x !== val);
                                setFormData({ ...formData, accessibleSites: nextList });
                              }}
                              className="w-4 h-4 text-[#0EFF2A] border-gray-300 rounded focus:ring-[#0EFF2A]"
                            />
                            <span className="text-sm text-gray-700">{label}</span>
                          </label>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="text-xs text-gray-500">No integrated sites or Meta pages found.</div>
                  )}
                </div>
              )}

              <div className="pt-2 border-t border-gray-100 dark:border-gray-800">
                <button
                  type="button"
                  onClick={() => setShowAdvancedSettings(!showAdvancedSettings)}
                  className="text-xs font-semibold text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200 transition-colors flex items-center gap-1"
                >
                  {showAdvancedSettings ? "Hide Advanced Tracking Settings" : "Show Advanced Tracking Settings (GTM, Site Link)"}
                </button>
              </div>

              {showFullUserSetup && (
                <div className="space-y-4 pt-2">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 dark:text-gray-800 mb-2">
                      Site Link
                    </label>
                    <input
                      type="url"
                      value={formData.siteLink}
                      onChange={(e) => {
                        const v = e.target.value;
                        setFormData((prev) => ({ ...prev, siteLink: v }));
                        setSiteIntegrationForm((prev) => ({ ...prev, siteUrl: v }));
                      }}
                      placeholder="https://example.com"
                      className="w-full px-4 py-2 border border-gray-200 dark:border-gray-300 rounded-xl focus:ring-2 focus:ring-[#0EFF2A] focus:border-transparent bg-white dark:bg-gray-50 text-gray-900 dark:text-black"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 dark:text-gray-800 mb-2">
                      GTM Container ID
                    </label>
                    <input
                      type="text"
                      value={formData.gtmContainerId || ""}
                      onChange={(e) => setFormData({ ...formData, gtmContainerId: e.target.value })}
                      placeholder="GTM-XXXXXXX"
                      className="w-full px-4 py-2 border border-gray-200 dark:border-gray-300 rounded-xl focus:ring-2 focus:ring-[#0EFF2A] focus:border-transparent bg-white dark:bg-gray-50 text-gray-900 dark:text-black"
                    />
                    <p className="mt-1 text-xs text-gray-500">
                      Add GTM container ID to ingest social metrics via `/api/smm/collect`.
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1">Facebook Page ID (Manual)</label>
                      <input
                        type="text"
                        value={formData.facebookPageId || ""}
                        onChange={(e) => setFormData({ ...formData, facebookPageId: e.target.value })}
                        placeholder="Manual ID entry..."
                        className="w-full px-3 py-1.5 border border-gray-200 rounded text-sm text-gray-700 bg-white"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1">Instagram User ID (Manual)</label>
                      <input
                        type="text"
                        value={formData.instagramUserId || ""}
                        onChange={(e) => setFormData({ ...formData, instagramUserId: e.target.value })}
                        placeholder="Manual ID entry..."
                        className="w-full px-3 py-1.5 border border-gray-200 rounded text-sm text-gray-700 bg-white"
                      />
                    </div>
                  </div>
                </div>
              )}

              {showFullUserSetup && (
                <div className="rounded-xl border border-gray-200 p-4 space-y-3">
                  <p className="text-sm font-semibold text-gray-900">Site Integration</p>
                  {!editingUser && (
                    <p className="text-xs text-gray-600">
                      If you fill Site URL or Property ID, integration is saved automatically when you click Create.
                    </p>
                  )}
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      User Name / Email (optional for verification)
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
                      className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#0EFF2A] focus:border-transparent bg-white text-gray-900"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      Site URL
                    </label>
                    <input
                      type="url"
                      value={siteIntegrationForm.siteUrl}
                      onChange={(e) => {
                        const v = e.target.value;
                        setSiteIntegrationForm((prev) => ({ ...prev, siteUrl: v }));
                        setFormData((prev) => ({ ...prev, siteLink: v }));
                      }}
                      placeholder="https://example.com"
                      className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#0EFF2A] focus:border-transparent bg-white text-gray-900"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      Property ID
                    </label>
                    <input
                      type="text"
                      value={siteIntegrationForm.propertyId}
                      onChange={(e) =>
                        setSiteIntegrationForm((prev) => ({ ...prev, propertyId: e.target.value }))
                      }
                      placeholder="sc-domain:example.com"
                      className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#0EFF2A] focus:border-transparent bg-white text-gray-900"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleSaveSiteIntegrationForUser}
                    disabled={integratingSite || !editingUser}
                    className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 bg-black text-white rounded-xl font-semibold disabled:opacity-60"
                  >
                    <FiSave className="w-4 h-4" />
                    {integratingSite ? "Saving..." : "Save Integration"}
                  </button>
                  {integrationPreview && (
                    <div className="grid grid-cols-2 gap-3 text-sm pt-1">
                      <div className="rounded-lg border border-gray-200 px-3 py-2">
                        <p className="text-gray-500">Clicks</p>
                        <p className="font-semibold text-gray-900">{integrationPreview.totalClicks}</p>
                      </div>
                      <div className="rounded-lg border border-gray-200 px-3 py-2">
                        <p className="text-gray-500">Impressions</p>
                        <p className="font-semibold text-gray-900">{integrationPreview.totalImpressions}</p>
                      </div>
                      <div className="rounded-lg border border-gray-200 px-3 py-2">
                        <p className="text-gray-500">Avg CTR</p>
                        <p className="font-semibold text-gray-900">
                          {(integrationPreview.averageCtr * 100).toFixed(2)}%
                        </p>
                      </div>
                      <div className="rounded-lg border border-gray-200 px-3 py-2">
                        <p className="text-gray-500">Avg Position</p>
                        <p className="font-semibold text-gray-900">
                          {integrationPreview.averagePosition.toFixed(1)}
                        </p>
                      </div>
                    </div>
                  )}
                  <div className="rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-600">
                    Send GTM-collected platform metrics to <span className="font-mono">/api/smm/collect</span> with this
                    user&apos;s GTM ID and site URL.
                  </div>
                </div>
              )}

              {showFullUserSetup && (
                <div className="rounded-xl border border-gray-200 p-4 space-y-3">
                  <p className="text-sm font-semibold text-gray-900">SMM Baseline Setup (Followers)</p>
                  <p className="text-xs text-gray-600">
                    Optional quick-start: enter current followers so SMM cards show numbers immediately before GTM events start.
                  </p>
                  {!editingUser && (
                    <p className="text-xs text-gray-600">
                      Baseline values are saved when you click Create (needs Site Link or integrated site URL). Use Edit
                      after creation to fetch counts from handles.
                    </p>
                  )}
                  {loadingSmmBaseline && (
                    <p className="text-xs text-gray-500">Loading saved SMM baseline...</p>
                  )}
                  {smmBaselines.map((row) => (
                    <div key={row.platform} className="space-y-1.5">
                      <div className="grid grid-cols-1 md:grid-cols-[120px_1fr_140px] gap-2">
                      <div className="px-3 py-2 rounded border border-gray-200 bg-gray-50 text-sm text-gray-700">
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
                        className="px-3 py-2 border border-gray-200 rounded text-sm focus:ring-2 focus:ring-[#0EFF2A] focus:border-transparent"
                      />
                      <input
                        type="number"
                        min="0"
                        value={row.followers}
                        onChange={(e) => handleSmmBaselineChange(row.platform, "followers", e.target.value)}
                        placeholder="Followers"
                        className="px-3 py-2 border border-gray-200 rounded text-sm focus:ring-2 focus:ring-[#0EFF2A] focus:border-transparent"
                      />
                      </div>
                      {smmFetchStatusByPlatform[row.platform] && (
                        <div className="flex items-center gap-2 pl-1">
                          <span
                            className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                              smmFetchStatusByPlatform[row.platform].status === "resolved"
                                ? "bg-green-100 text-green-700"
                                : smmFetchStatusByPlatform[row.platform].status === "loading"
                                  ? "bg-blue-100 text-blue-700"
                                  : "bg-amber-100 text-amber-700"
                            }`}
                          >
                            {smmFetchStatusByPlatform[row.platform].status}
                          </span>
                          <span className="text-[11px] text-gray-600">
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
                    className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 border border-gray-300 text-gray-800 bg-white rounded-xl font-semibold disabled:opacity-60"
                  >
                    <FiRefreshCw className={`w-4 h-4 ${fetchingSmmFromHandles ? "animate-spin" : ""}`} />
                    {fetchingSmmFromHandles ? "Fetching from handles..." : "Fetch from Handles"}
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveSmmBaseline}
                    disabled={savingSmmBaseline || !editingUser}
                    className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 bg-black text-white rounded-xl font-semibold disabled:opacity-60"
                  >
                    <FiSave className="w-4 h-4" />
                    {savingSmmBaseline ? "Saving baseline..." : "Save SMM Baseline"}
                  </button>
                  <p className="text-xs text-gray-500">
                    Auto-fetch uses YouTube, Meta (Facebook/Instagram), and TikTok (TIKTOK_CLIENT_KEY/SECRET in .env.local). TikTok rows: @handle or tiktok.com profile URL only.
                  </p>
                </div>
              )}

              {editingUser && editingUser.role === ROLES.SUPER_ADMIN && (
                <div className="rounded-xl border border-gray-200 p-4">
                  <p className="text-sm text-gray-600">
                    Site Integration fields are hidden for Super Admin accounts.
                  </p>
                </div>
              )}

              <div>
                <label className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    checked={formData.isActive === true}
                    onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                    className="w-4 h-4 text-[#0EFF2A] border-gray-300 rounded focus:ring-[#0EFF2A]"
                  />
                  <span className="text-sm font-semibold text-gray-700 dark:text-gray-800">Active</span>
                </label>
                {!editingUser && (
                  <p className="mt-1 text-xs text-gray-500">
                    New accounts are ready to sign in immediately (no verification email). Uncheck only if you want
                    this user blocked from logging in.
                  </p>
                )}
              </div>

              <div className="flex space-x-3 pt-4">
                <button
                  type="submit"
                  className="flex-1 flex items-center justify-center space-x-2 px-4 py-2 bg-[#0EFF2A] hover:bg-[#0BCC22] text-white rounded-xl font-semibold transition-colors"
                >
                  <FiSave className="w-4 h-4" />
                  <span>{editingUser ? "Update" : "Create"}</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateModal(false);
                    setEditingUser(null);
                    setFormData({
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
                  className="flex-1 flex items-center justify-center space-x-2 px-4 py-2 bg-gray-100 dark:bg-gray-200 hover:bg-gray-200 dark:hover:bg-gray-300 text-gray-700 dark:text-gray-800 rounded-xl font-semibold transition-colors"
                >
                  <FiX className="w-4 h-4" />
                  <span>Cancel</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

