"use client";

import { useActionState } from "react";
import {
  grantProAction,
  revokeProAction,
  type AdminActionState,
} from "@/app/actions/admin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

const initialState: AdminActionState = { success: false, message: "" };

export function GrantProForm() {
  const [grantState, grantFormAction, grantPending] = useActionState(
    grantProAction,
    initialState,
  );
  const [revokeState, revokeFormAction, revokePending] = useActionState(
    revokeProAction,
    initialState,
  );

  const state = grantState.message ? grantState : revokeState;

  return (
    <div className="space-y-5">
      <form action={grantFormAction} className="space-y-4">
        <Input
          label="Почта мастера"
          name="email"
          type="email"
          required
          placeholder="master@example.com"
          autoComplete="off"
        />
        <Select
          label="Срок PRO"
          name="duration"
          defaultValue="30"
          options={[
            { label: "30 дней", value: "30" },
            { label: "90 дней", value: "90" },
            { label: "365 дней", value: "365" },
            { label: "Бессрочно", value: "lifetime" },
          ]}
        />
        <div className="flex flex-wrap gap-3">
          <Button type="submit" disabled={grantPending}>
            {grantPending ? "Выдаём…" : "Выдать PRO"}
          </Button>
          <Button
            type="submit"
            variant="secondary"
            formAction={revokeFormAction}
            disabled={revokePending}
          >
            {revokePending ? "Снимаем…" : "Снять PRO"}
          </Button>
        </div>
      </form>

      {state.message ? (
        <p
          className="text-sm font-medium"
          style={{
            color: state.success
              ? "var(--color-success)"
              : "var(--color-warning)",
          }}
        >
          {state.message}
        </p>
      ) : null}
    </div>
  );
}
