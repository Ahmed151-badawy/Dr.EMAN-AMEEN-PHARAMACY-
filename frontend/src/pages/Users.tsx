import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Users as UsersIcon,
  UserPlus,
  ShieldAlert,
  ShieldCheck,
  Edit2,
  X,
  User as UserIcon,
  Lock,
  Check,
  PowerOff,
  Trash2,
} from "lucide-react";
import { useI18n } from "../i18n/i18nContext";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { usersApi, UserCreatePayload, UserUpdatePayload } from "../services/api/users";
import { User, UserRole } from "../types";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { Badge } from "../components/ui/Badge";
import { Skeleton } from "../components/ui/Skeleton";

export const Users: React.FC = () => {
  const { t, direction } = useI18n();
  const { user: currentUser } = useAuth();
  const { success, error } = useToast();
  const queryClient = useQueryClient();

  const isAdmin = currentUser?.role === "admin";
  const isPrimaryAdmin = currentUser?.is_primary_admin === true;

  // Create User Modal State
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [createFormData, setCreateFormData] = useState<UserCreatePayload>({
    username: "",
    full_name: "",
    password: "",
    role: "cashier" as UserRole,
  });

  // Edit User Modal State
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [editFormData, setEditFormData] = useState<{
    full_name: string;
    role: UserRole;
    is_active: boolean;
    password: string;
  }>({
    full_name: "",
    role: "cashier" as UserRole,
    is_active: true,
    password: "",
  });

  // Delete User Modal State
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [userToDelete, setUserToDelete] = useState<User | null>(null);

  // Query: Users List (Admin only)
  const { data: usersList, isLoading: isLoadingUsers } = useQuery({
    queryKey: ["users", "list"],
    queryFn: () => usersApi.list(),
    enabled: isAdmin,
  });

  // Mutation: Create User
  const createUserMutation = useMutation({
    mutationFn: (payload: UserCreatePayload) => usersApi.create(payload),
    onSuccess: () => {
      success(t("users.createSuccess"));
      setIsCreateModalOpen(false);
      setCreateFormData({
        username: "",
        full_name: "",
        password: "",
        role: "cashier" as UserRole,
      });
      queryClient.invalidateQueries({ queryKey: ["users"] });
    },
    onError: (err: any) => {
      if (err?.message?.includes("already taken") || err?.status === 400) {
        error(t("users.duplicateUsername"));
      } else {
        error(err?.message || t("common.somethingWentWrong"));
      }
    },
  });

  // Mutation: Update User
  const updateUserMutation = useMutation({
    mutationFn: ({ userId, payload }: { userId: string; payload: UserUpdatePayload }) =>
      usersApi.update(userId, payload),
    onSuccess: () => {
      success(t("users.updateSuccess"));
      setIsEditModalOpen(false);
      setEditingUser(null);
      queryClient.invalidateQueries({ queryKey: ["users"] });
    },
    onError: (err: any) => {
      error(err?.message || t("common.somethingWentWrong"));
    },
  });

  // Mutation: Deactivate / Toggle Status
  const toggleStatusMutation = useMutation({
    mutationFn: ({ userId, is_active }: { userId: string; is_active: boolean }) =>
      usersApi.update(userId, { is_active }),
    onSuccess: () => {
      success(t("users.updateSuccess"));
      queryClient.invalidateQueries({ queryKey: ["users"] });
    },
    onError: (err: any) => {
      error(err?.message || t("common.somethingWentWrong"));
    },
  });

  // Mutation: Delete User Permanently
  const deleteUserMutation = useMutation({
    mutationFn: (userId: string) => usersApi.delete(userId, true),
    onSuccess: () => {
      success(t("users.deleteSuccess"));
      setIsDeleteModalOpen(false);
      setUserToDelete(null);
      queryClient.invalidateQueries({ queryKey: ["users"] });
    },
    onError: (err: any) => {
      error(err?.message || t("common.somethingWentWrong"));
    },
  });

  const handleOpenEdit = (user: User) => {
    setEditingUser(user);
    setEditFormData({
      full_name: user.full_name,
      role: user.role,
      is_active: user.is_active,
      password: "",
    });
    setIsEditModalOpen(true);
  };

  // If user is not an admin, show permission notice
  if (!isAdmin) {
    return (
      <Card style={{ padding: "3rem", textAlign: "center", maxWidth: "600px", margin: "2rem auto" }}>
        <div
          style={{
            width: "56px",
            height: "56px",
            borderRadius: "var(--radius-full)",
            background: "var(--color-danger-light)",
            color: "var(--color-danger)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            margin: "0 auto 1rem",
          }}
        >
          <ShieldAlert size={28} />
        </div>
        <h2 style={{ fontSize: "1.25rem", fontWeight: 800, color: "var(--color-text)" }}>
          {t("users.unauthorizedTitle")}
        </h2>
        <p style={{ fontSize: "0.875rem", color: "var(--color-text-muted)", marginTop: "0.5rem", lineHeight: 1.5 }}>
          {t("users.unauthorizedDesc")}
        </p>
      </Card>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      {/* Header Bar */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "1rem",
        }}
      >
        <div>
          <h1
            style={{
              fontSize: "1.6rem",
              fontWeight: 800,
              color: "var(--color-text)",
              letterSpacing: "-0.02em",
              display: "flex",
              alignItems: "center",
              gap: "0.625rem",
            }}
          >
            <UsersIcon size={28} color="var(--color-primary)" />
            {t("users.title")}
          </h1>
          <p style={{ fontSize: "0.875rem", color: "var(--color-text-muted)", marginTop: "0.15rem" }}>
            {t("users.subtitle")}
          </p>
        </div>

        {isPrimaryAdmin ? (
          <Button
            variant="primary"
            onClick={() => setIsCreateModalOpen(true)}
            leftIcon={<UserPlus size={18} />}
          >
            {t("users.addUser")}
          </Button>
        ) : (
          <Badge variant="warning" style={{ padding: "0.5rem 0.85rem", fontSize: "0.8rem", display: "flex", alignItems: "center", gap: "0.4rem" }}>
            <Lock size={14} />
            <span>{t("users.primaryAdminRestricted")}</span>
          </Badge>
        )}
      </div>

      {/* Main Table Card */}
      <Card style={{ padding: "1.25rem", display: "flex", flexDirection: "column", gap: "1rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--color-text-muted)" }}>
            {t("users.userCount", { count: usersList?.length || 0 })}
          </div>
          {isPrimaryAdmin && (
            <Badge variant="success" style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
              <ShieldCheck size={14} />
              <span>{t("users.primaryOwner")}</span>
            </Badge>
          )}
        </div>

        {isLoadingUsers ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            <Skeleton height="50px" />
            <Skeleton height="50px" />
            <Skeleton height="50px" />
          </div>
        ) : usersList && usersList.length > 0 ? (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", textAlign: direction === "rtl" ? "right" : "left" }}>
              <thead>
                <tr style={{ borderBottom: "1.5px solid var(--color-border)", color: "var(--color-text-muted)", fontSize: "0.8rem", textTransform: "uppercase" }}>
                  <th style={{ padding: "0.75rem 1rem" }}>{t("users.username")}</th>
                  <th style={{ padding: "0.75rem 1rem" }}>{t("users.fullName")}</th>
                  <th style={{ padding: "0.75rem 1rem" }}>{t("users.role")}</th>
                  <th style={{ padding: "0.75rem 1rem" }}>{t("users.designation")}</th>
                  <th style={{ padding: "0.75rem 1rem" }}>{t("users.status")}</th>
                  {isPrimaryAdmin && (
                    <th style={{ padding: "0.75rem 1rem", textAlign: "end" }}>{t("common.actions")}</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {usersList.map((u) => {
                  const isUserPrimary = u.is_primary_admin === true;

                  return (
                    <tr
                      key={u.id}
                      style={{
                        borderBottom: "1px solid var(--color-border-subtle)",
                        fontSize: "0.9rem",
                        background: isUserPrimary ? "var(--color-surface-subtle)" : "transparent",
                      }}
                    >
                      <td style={{ padding: "0.875rem 1rem" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                          <div
                            style={{
                              width: "32px",
                              height: "32px",
                              borderRadius: "var(--radius-full)",
                              background: isUserPrimary ? "var(--color-primary-light)" : "var(--color-surface-subtle)",
                              color: isUserPrimary ? "var(--color-primary)" : "var(--color-text-muted)",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                            }}
                          >
                            <UserIcon size={16} />
                          </div>
                          <span style={{ fontWeight: 700, color: "var(--color-text)" }}>
                            {u.username}
                          </span>
                          {u.username === currentUser?.username && (
                            <span style={{ fontSize: "0.75rem", color: "var(--color-primary)", fontWeight: 600 }}>
                              (You)
                            </span>
                          )}
                        </div>
                      </td>

                      <td style={{ padding: "0.875rem 1rem", color: "var(--color-text)", fontWeight: 500 }}>
                        {u.full_name}
                      </td>

                      <td style={{ padding: "0.875rem 1rem" }}>
                        <Badge variant={u.role === "admin" ? "warning" : "info"}>
                          {t(`roles.${u.role}`) || u.role}
                        </Badge>
                      </td>

                      <td style={{ padding: "0.875rem 1rem" }}>
                        {isUserPrimary ? (
                          <Badge variant="success" style={{ display: "inline-flex", alignItems: "center", gap: "0.3rem" }}>
                            <ShieldCheck size={13} />
                            <span>{t("users.primaryOwner")}</span>
                          </Badge>
                        ) : (
                          <span style={{ color: "var(--color-text-muted)", fontSize: "0.85rem" }}>
                            {t("users.staffMember")}
                          </span>
                        )}
                      </td>

                      <td style={{ padding: "0.875rem 1rem" }}>
                        <Badge variant={u.is_active ? "success" : "danger"}>
                          {u.is_active ? t("users.active") : t("users.inactive")}
                        </Badge>
                      </td>

                      {isPrimaryAdmin && (
                        <td style={{ padding: "0.875rem 1rem", textAlign: "end" }}>
                          {isUserPrimary ? (
                            <span style={{ fontSize: "0.8rem", color: "var(--color-text-muted)", fontStyle: "italic" }}>
                              {t("users.ownerProtected")}
                            </span>
                          ) : (
                            <div style={{ display: "inline-flex", gap: "0.5rem" }}>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleOpenEdit(u)}
                                leftIcon={<Edit2 size={14} />}
                              >
                                {t("common.edit")}
                              </Button>
                              <Button
                                size="sm"
                                variant={u.is_active ? "ghost" : "primary"}
                                onClick={() =>
                                  toggleStatusMutation.mutate({
                                    userId: u.id,
                                    is_active: !u.is_active,
                                  })
                                }
                                isLoading={toggleStatusMutation.isPending}
                                leftIcon={u.is_active ? <PowerOff size={14} /> : <Check size={14} />}
                              >
                                {u.is_active ? t("users.inactive") : t("users.active")}
                              </Button>
                              <Button
                                size="sm"
                                variant="danger"
                                onClick={() => {
                                  setUserToDelete(u);
                                  setIsDeleteModalOpen(true);
                                }}
                                leftIcon={<Trash2 size={14} />}
                                title={direction === "rtl" ? "حذف الحساب نهائياً" : "Delete Account Permanently"}
                              >
                                {t("common.delete")}
                              </Button>
                            </div>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div style={{ padding: "3rem", textAlign: "center", color: "var(--color-text-muted)" }}>
            <UsersIcon size={40} color="var(--color-border)" style={{ marginBottom: "0.5rem" }} />
            <div>{t("users.emptyUsers")}</div>
          </div>
        )}
      </Card>

      {/* Create User Modal (Primary Admin Only) */}
      {isCreateModalOpen && isPrimaryAdmin && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 100,
            backdropFilter: "blur(4px)",
          }}
        >
          <div
            style={{
              background: "var(--color-surface)",
              borderRadius: "var(--radius-xl)",
              padding: "2rem",
              width: "100%",
              maxWidth: "500px",
              boxShadow: "var(--shadow-xl)",
              display: "flex",
              flexDirection: "column",
              gap: "1.25rem",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h2 style={{ fontSize: "1.25rem", fontWeight: 800, color: "var(--color-text)" }}>
                {t("users.createModalTitle")}
              </h2>
              <button onClick={() => setIsCreateModalOpen(false)} style={{ color: "var(--color-text-muted)" }}>
                <X size={20} />
              </button>
            </div>

            <p style={{ fontSize: "0.85rem", color: "var(--color-text-muted)" }}>
              {t("users.createModalDesc")}
            </p>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                createUserMutation.mutate(createFormData);
              }}
              style={{ display: "flex", flexDirection: "column", gap: "1rem" }}
            >
              <Input
                label={t("users.username") + " *"}
                value={createFormData.username}
                onChange={(e) => setCreateFormData({ ...createFormData, username: e.target.value })}
                required
                name="new_staff_username"
                autoComplete="off"
                placeholder="e.g. ahmed_pharm"
              />

              <Input
                label={t("users.fullName") + " *"}
                value={createFormData.full_name}
                onChange={(e) => setCreateFormData({ ...createFormData, full_name: e.target.value })}
                required
                name="new_staff_fullname"
                autoComplete="off"
                placeholder="e.g. Dr. Ahmed Mahmoud"
              />

              <div>
                <Input
                  label={t("users.password") + " *"}
                  type="password"
                  value={createFormData.password}
                  onChange={(e) => setCreateFormData({ ...createFormData, password: e.target.value })}
                  required
                  name="new_staff_password"
                  autoComplete="new-password"
                  placeholder="••••••••"
                />
                <p style={{ fontSize: "0.75rem", color: "var(--color-text-muted)", marginTop: "0.25rem" }}>
                  {t("users.passwordHelp")}
                </p>
              </div>

              <div>
                <label style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--color-text)", display: "block", marginBottom: "0.35rem" }}>
                  {t("users.role")} *
                </label>
                <select
                  value={createFormData.role}
                  onChange={(e) => setCreateFormData({ ...createFormData, role: e.target.value as UserRole })}
                  required
                  style={{
                    width: "100%",
                    padding: "0.625rem",
                    borderRadius: "var(--radius-md)",
                    border: "1.5px solid var(--color-border)",
                    background: "var(--color-surface)",
                    fontSize: "0.9rem",
                  }}
                >
                  <option value="cashier">{t("roles.cashier")}</option>
                  <option value="pharmacist">{t("roles.pharmacist")}</option>
                  <option value="inventory_manager">{t("roles.inventory_manager")}</option>
                  <option value="admin">{t("roles.admin")}</option>
                </select>
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem", marginTop: "1rem" }}>
                <Button variant="outline" type="button" onClick={() => setIsCreateModalOpen(false)}>
                  {t("common.cancel")}
                </Button>
                <Button variant="primary" type="submit" isLoading={createUserMutation.isPending}>
                  {t("common.save")}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit User Modal (Primary Admin Only) */}
      {isEditModalOpen && isPrimaryAdmin && editingUser && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 100,
            backdropFilter: "blur(4px)",
          }}
        >
          <div
            style={{
              background: "var(--color-surface)",
              borderRadius: "var(--radius-xl)",
              padding: "2rem",
              width: "100%",
              maxWidth: "500px",
              boxShadow: "var(--shadow-xl)",
              display: "flex",
              flexDirection: "column",
              gap: "1.25rem",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h2 style={{ fontSize: "1.25rem", fontWeight: 800, color: "var(--color-text)" }}>
                {t("users.editModalTitle")} — {editingUser.username}
              </h2>
              <button onClick={() => setIsEditModalOpen(false)} style={{ color: "var(--color-text-muted)" }}>
                <X size={20} />
              </button>
            </div>

            <p style={{ fontSize: "0.85rem", color: "var(--color-text-muted)" }}>
              {t("users.editModalDesc")}
            </p>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                const payload: UserUpdatePayload = {
                  full_name: editFormData.full_name,
                  role: editFormData.role,
                  is_active: editFormData.is_active,
                };
                if (editFormData.password.trim()) {
                  payload.password = editFormData.password.trim();
                }
                updateUserMutation.mutate({ userId: editingUser.id, payload });
              }}
              style={{ display: "flex", flexDirection: "column", gap: "1rem" }}
            >
              <Input
                label={t("users.fullName") + " *"}
                value={editFormData.full_name}
                onChange={(e) => setEditFormData({ ...editFormData, full_name: e.target.value })}
                required
                name="edit_staff_fullname"
                autoComplete="off"
              />

              <div>
                <label style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--color-text)", display: "block", marginBottom: "0.35rem" }}>
                  {t("users.role")} *
                </label>
                <select
                  value={editFormData.role}
                  onChange={(e) => setEditFormData({ ...editFormData, role: e.target.value as UserRole })}
                  required
                  style={{
                    width: "100%",
                    padding: "0.625rem",
                    borderRadius: "var(--radius-md)",
                    border: "1.5px solid var(--color-border)",
                    background: "var(--color-surface)",
                    fontSize: "0.9rem",
                  }}
                >
                  <option value="cashier">{t("roles.cashier")}</option>
                  <option value="pharmacist">{t("roles.pharmacist")}</option>
                  <option value="inventory_manager">{t("roles.inventory_manager")}</option>
                  <option value="admin">{t("roles.admin")}</option>
                </select>
              </div>

              <div>
                <Input
                  label={t("users.newPasswordOptional")}
                  type="password"
                  value={editFormData.password}
                  onChange={(e) => setEditFormData({ ...editFormData, password: e.target.value })}
                  name="edit_staff_password"
                  autoComplete="new-password"
                  placeholder="••••••••"
                />
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <input
                  type="checkbox"
                  id="edit_is_active"
                  checked={editFormData.is_active}
                  onChange={(e) => setEditFormData({ ...editFormData, is_active: e.target.checked })}
                />
                <label htmlFor="edit_is_active" style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--color-text)" }}>
                  {editFormData.is_active ? t("users.accountActive") : t("users.accountDisabled")}
                </label>
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem", marginTop: "1rem" }}>
                <Button variant="outline" type="button" onClick={() => setIsEditModalOpen(false)}>
                  {t("common.cancel")}
                </Button>
                <Button variant="primary" type="submit" isLoading={updateUserMutation.isPending}>
                  {t("common.save")}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {isDeleteModalOpen && userToDelete && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(0, 0, 0, 0.6)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1050,
            padding: "1rem",
          }}
          onClick={() => !deleteUserMutation.isPending && setIsDeleteModalOpen(false)}
        >
          <div
            style={{
              backgroundColor: "var(--color-surface)",
              borderRadius: "var(--radius-lg)",
              padding: "1.75rem",
              width: "100%",
              maxWidth: "480px",
              boxShadow: "var(--shadow-xl)",
              border: "1px solid var(--color-border)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "1rem" }}>
              <div
                style={{
                  width: "44px",
                  height: "44px",
                  borderRadius: "var(--radius-full)",
                  background: "var(--color-danger-light)",
                  color: "var(--color-danger)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <Trash2 size={24} />
              </div>
              <div>
                <h3 style={{ fontSize: "1.15rem", fontWeight: 700, color: "var(--color-text)" }}>
                  {t("users.deleteConfirmTitle")}
                </h3>
                <p style={{ fontSize: "0.825rem", color: "var(--color-text-muted)" }}>
                  {userToDelete.full_name} (@{userToDelete.username})
                </p>
              </div>
            </div>

            <p style={{ fontSize: "0.9rem", color: "var(--color-text)", lineHeight: 1.5, marginBottom: "1.5rem" }}>
              {t("users.deleteConfirmDesc", { name: userToDelete.full_name, username: userToDelete.username })}
            </p>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem" }}>
              <Button
                variant="outline"
                onClick={() => setIsDeleteModalOpen(false)}
                disabled={deleteUserMutation.isPending}
              >
                {t("common.cancel")}
              </Button>
              <Button
                variant="danger"
                onClick={() => deleteUserMutation.mutate(userToDelete.id)}
                isLoading={deleteUserMutation.isPending}
                leftIcon={<Trash2 size={16} />}
              >
                {t("users.deleteConfirmButton")}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
