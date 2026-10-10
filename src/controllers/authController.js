import { User, publicUser } from "../models/User.js";
import { ROLES, normalizePermissions } from "../constants/permissions.js";
import {
  createSession,
  revokeToken,
  revokeUserSessions,
} from "../services/sessionService.js";
import { hashPassword, verifyPassword } from "../services/passwordService.js";
import {
  createPasswordReset,
  consumePasswordReset,
  revokePasswordResets,
} from "../services/passwordResetService.js";
import { sendData, sendMessage } from "../utils/response.js";
import {
  assertEmail,
  assertPassword,
  isPlainObject,
  normalizeEmail,
} from "../utils/validation.js";
import {
  forbidden,
  notFound,
  unauthorized,
  unprocessable,
} from "../utils/errors.js";

function sessionData(created, user, actor = null) {
  return {
    token: created.token,
    expiresAt: created.expiresAt,
    user: publicUser(user),
    actor: publicUser(actor),
    isImpersonating: Boolean(actor),
  };
}

function requestSessionOptions(req, config) {
  return {
    ttlMs: config.sessionTtlMs,
    userAgent: req.get("user-agent") || "",
    ipAddress: req.ip || req.socket.remoteAddress || "",
  };
}

export function createAuthController(config) {
  return {
    login: async (req, res) => {
      if (!isPlainObject(req.body))
        throw unprocessable("Email and password are required");
      const email = assertEmail(req.body.email);
      if (typeof req.body.password !== "string" || !req.body.password) {
        throw unprocessable("Email and password are required", [
          { field: "password", issue: "required" },
        ]);
      }
      const user = await User.findOne({ email }).select("+passwordHash");
      const valid = user
        ? await verifyPassword(req.body.password, user.passwordHash)
        : false;
      if (!valid) throw unauthorized("Invalid email or password");
      if (user.blocked) throw forbidden("This account is blocked");
      user.lastLoginAt = new Date();
      await user.save();
      const created = await createSession({
        user,
        ...requestSessionOptions(req, config),
      });
      return sendData(res, sessionData(created, user));
    },

    logout: async (req, res) => {
      await revokeToken(req.auth.tokenHash);
      return sendMessage(res, "Signed out successfully");
    },

    me: async (req, res) =>
      sendData(res, {
        user: req.auth.user,
        actor: req.auth.actor,
        isImpersonating: req.auth.isImpersonating,
      }),

    changePassword: async (req, res) => {
      if (!isPlainObject(req.body))
        throw unprocessable("Current and new passwords are required");
      const { currentPassword, newPassword } = req.body;
      if (typeof currentPassword !== "string" || !currentPassword) {
        throw unprocessable("Current password is required", [
          { field: "currentPassword", issue: "required" },
        ]);
      }
      assertPassword(newPassword, "newPassword");
      const user = await User.findById(req.auth.userDocument._id).select(
        "+passwordHash",
      );
      if (
        !user ||
        !(await verifyPassword(currentPassword, user.passwordHash))
      ) {
        throw unprocessable("Current password is incorrect", [
          { field: "currentPassword", issue: "incorrect" },
        ]);
      }
      user.passwordHash = await hashPassword(newPassword);
      await user.save();
      await Promise.all([
        revokeUserSessions(user._id, req.auth.tokenHash),
        revokePasswordResets(user._id),
      ]);
      return sendMessage(res, "Password changed successfully");
    },

    forgotPassword: async (req, res) => {
      const email =
        isPlainObject(req.body) && req.body.email
          ? assertEmail(req.body.email)
          : "";
      let developmentReset = null;
      if (email) {
        const user = await User.findOne({
          email: normalizeEmail(email),
          blocked: false,
        });
        if (user) {
          developmentReset = await createPasswordReset(
            user,
            config.passwordResetTtlMs,
          );
        }
      }
      const data = {
        message:
          "If an account exists for that email, password reset instructions will be sent.",
      };
      if (developmentReset && config.nodeEnv !== "production") {
        data.resetToken = developmentReset.token;
        data.expiresAt = developmentReset.expiresAt;
      }
      return sendData(res, data, 202);
    },

    resetPassword: async (req, res) => {
      if (!isPlainObject(req.body)) {
        throw unprocessable("Reset token and new password are required");
      }
      const password = assertPassword(req.body.newPassword, "newPassword");
      const user = await consumePasswordReset(req.body.token);
      if (!user || user.blocked) {
        throw unauthorized("Password reset token is invalid or expired");
      }
      user.passwordHash = await hashPassword(password);
      await user.save();
      await revokeUserSessions(user._id);
      return sendMessage(res, "Password reset successfully");
    },

    impersonate: async (req, res) => {
      if (req.auth.user.role !== "Super Admin" || req.auth.isImpersonating) {
        throw forbidden("Super Admin access is required");
      }
      const target = await User.findOne({ userId: req.params.userId });
      if (!target) throw notFound("User not found");
      if (target.blocked)
        throw forbidden("Blocked users cannot be impersonated");
      if (target.role === "Super Admin")
        throw unprocessable("A Super Admin cannot be impersonated");
      const created = await createSession({
        user: target,
        actorUser: req.auth.userDocument,
        ...requestSessionOptions(req, config),
      });
      return sendData(res, sessionData(created, target, req.auth.userDocument));
    },

    stopImpersonation: async (req, res) => {
      if (!req.auth.isImpersonating || !req.auth.actorDocument) {
        throw unprocessable("The current session is not impersonating a user");
      }
      const actor = await User.findById(req.auth.actorDocument._id);
      if (!actor || actor.blocked || actor.role !== "Super Admin") {
        throw unauthorized("The impersonating account is no longer available");
      }
      await revokeToken(req.auth.tokenHash);
      const created = await createSession({
        user: actor,
        ...requestSessionOptions(req, config),
      });
      return sendData(res, sessionData(created, actor));
    },
  };
}
