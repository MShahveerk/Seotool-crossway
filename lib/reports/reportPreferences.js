import { ROLES } from "../rbac.js";

/**
 * Default report preferences by role (any role can override in admin UI).
 * super_admin always receives all reports regardless of stored flags.
 */
export function getDefaultReportPreferencesForRole(role) {
  const r = String(role || ROLES.USER).toLowerCase();
  if (r === ROLES.SUPER_ADMIN) {
    return {
      weeklyDigestEnabled: true,
      receiveWebsiteReport: true,
      receiveSmmReport: true,
      receiveCombinedReport: false,
    };
  }
  if (r === ROLES.APPROVER) {
    return {
      weeklyDigestEnabled: false,
      receiveWebsiteReport: true,
      receiveSmmReport: true,
      receiveCombinedReport: false,
    };
  }
  // user / viewer / smm — staff digest on by default
  return {
    weeklyDigestEnabled: true,
    receiveWebsiteReport: false,
    receiveSmmReport: false,
    receiveCombinedReport: false,
  };
}

export function coerceReportPreferences(raw, role = ROLES.USER) {
  const defaults = getDefaultReportPreferencesForRole(role);
  if (!raw || typeof raw !== "object") return { ...defaults };
  return {
    weeklyDigestEnabled:
      raw.weeklyDigestEnabled != null ? Boolean(raw.weeklyDigestEnabled) : defaults.weeklyDigestEnabled,
    receiveWebsiteReport:
      raw.receiveWebsiteReport != null ? Boolean(raw.receiveWebsiteReport) : defaults.receiveWebsiteReport,
    receiveSmmReport:
      raw.receiveSmmReport != null ? Boolean(raw.receiveSmmReport) : defaults.receiveSmmReport,
    receiveCombinedReport:
      raw.receiveCombinedReport != null
        ? Boolean(raw.receiveCombinedReport)
        : defaults.receiveCombinedReport,
  };
}

export function pickReportPreferencesFromBody(body = {}) {
  const out = {};
  if (body.weeklyDigestEnabled !== undefined) out.weeklyDigestEnabled = Boolean(body.weeklyDigestEnabled);
  if (body.receiveWebsiteReport !== undefined) out.receiveWebsiteReport = Boolean(body.receiveWebsiteReport);
  if (body.receiveSmmReport !== undefined) out.receiveSmmReport = Boolean(body.receiveSmmReport);
  if (body.receiveCombinedReport !== undefined) {
    out.receiveCombinedReport = Boolean(body.receiveCombinedReport);
  }
  return out;
}

export function userWantsStaffDigest(user) {
  if (!user) return false;
  if (user.role === ROLES.SUPER_ADMIN) return true;
  return Boolean(user.weeklyDigestEnabled);
}

export function userWantsClientWebsiteReport(user) {
  if (!user) return false;
  if (user.role === ROLES.SUPER_ADMIN) return true;
  return Boolean(user.receiveWebsiteReport);
}

export function userWantsClientSmmReport(user) {
  if (!user) return false;
  if (user.role === ROLES.SUPER_ADMIN) return true;
  return Boolean(user.receiveSmmReport);
}

export function userWantsCombinedReport(user) {
  if (!user) return false;
  if (user.role === ROLES.SUPER_ADMIN) return Boolean(user.receiveCombinedReport);
  return Boolean(user.receiveCombinedReport);
}
