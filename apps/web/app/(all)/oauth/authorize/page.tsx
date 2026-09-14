/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
// plane imports
import { Button } from "@plane/propel/button";
import { PlaneLogo } from "@plane/propel/icons";
// components
import { LogoSpinner } from "@/components/common/logo-spinner";
// services
import { AuthService } from "@/services/auth.service";

const authService = new AuthService();

/**
 * Parameters that make up the authorization request. They are echoed back to
 * the authorization endpoint untouched — dropping one (the PKCE challenge, the
 * resource indicator) silently downgrades the security of the exchange.
 */
const AUTHORIZATION_PARAMS = [
  "client_id",
  "redirect_uri",
  "response_type",
  "scope",
  "state",
  "code_challenge",
  "code_challenge_method",
  "nonce",
  "resource",
] as const;

type TAuthorizationInfo = {
  client_id: string;
  client_name: string;
  client_uri: string | null;
  is_dynamically_registered: boolean;
  redirect_uri: string;
  resource: string | null;
  scopes: { key: string; description: string }[];
  user: { id: string; email: string; display_name: string };
};

export default function OAuthAuthorizePage() {
  const searchParams = useSearchParams();
  const [info, setInfo] = useState<TAuthorizationInfo | null>(null);
  const [csrfToken, setCsrfToken] = useState<string | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const query = searchParams.toString();

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const response = await fetch(`/auth/o/authorize/info/?${query}`, {
          credentials: "include",
          headers: { Accept: "application/json" },
        });

        if (response.status === 401) {
          // Sign in, then come back to this exact request — query string and
          // all, which is why this page guards itself instead of leaning on
          // AuthenticationWrapper (that drops the query from next_path).
          const nextPath = encodeURIComponent(`${window.location.pathname}${window.location.search}`);
          window.location.replace(`/?next_path=${nextPath}`);
          return;
        }

        const body = await response.json();
        if (cancelled) return;

        if (!response.ok) {
          setError(
            body?.error === "invalid_request"
              ? "This authorization request is malformed. Start again from the application that sent you here."
              : "Plane could not verify this application. Start again from the application that sent you here."
          );
          return;
        }

        setInfo(body as TAuthorizationInfo);
      } catch {
        if (!cancelled) setError("Could not reach Plane. Check your connection and try again.");
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [query]);

  useEffect(() => {
    authService
      .requestCSRFToken()
      .then((data) => setCsrfToken(data?.csrf_token))
      .catch(() => setError("Could not start a secure session. Reload the page and try again."));
  }, []);

  if (error) {
    return (
      <Shell>
        <p className="text-base text-custom-text-100 font-medium">Authorization failed</p>
        <p className="text-sm text-custom-text-300 mt-2">{error}</p>
      </Shell>
    );
  }

  if (!info || !csrfToken) {
    return (
      <div className="relative flex h-screen w-full items-center justify-center">
        <LogoSpinner />
      </div>
    );
  }

  return (
    <Shell>
      <p className="text-lg text-custom-text-100 font-semibold">
        {info.client_name} wants to access your Plane account
      </p>
      <p className="text-sm text-custom-text-300 mt-1">Signed in as {info.user.display_name || info.user.email}</p>

      {info.is_dynamically_registered && (
        <p className="border-custom-border-200 bg-custom-background-90 text-xs text-custom-text-300 mt-4 rounded-md border p-3">
          This application registered itself automatically and has not been reviewed by Plane. Only continue if you
          started this from an application you trust.
        </p>
      )}

      <div className="mt-5">
        <p className="text-xs text-custom-text-400 font-medium tracking-wide uppercase">It will be able to</p>
        <ul className="mt-2 space-y-2">
          {info.scopes.map((scope) => (
            <li key={scope.key} className="text-sm text-custom-text-200">
              {scope.description}
            </li>
          ))}
        </ul>
      </div>

      <p className="text-xs text-custom-text-400 mt-5">
        Access is limited to what you can already see in Plane, across every workspace you belong to. You can revoke it
        at any time from your account settings.
      </p>

      <form method="post" action="/auth/o/authorize/" className="mt-6 flex gap-3" onSubmit={() => setSubmitting(true)}>
        <input type="hidden" name="csrfmiddlewaretoken" value={csrfToken} />
        {AUTHORIZATION_PARAMS.map((param) => {
          const value = searchParams.get(param);
          return value === null ? null : <input key={param} type="hidden" name={param} value={value} />;
        })}

        {/* Django's AllowForm reads consent from the presence of `allow`; the
            deny button submits the same form without it. */}
        <Button type="submit" name="allow" value="True" disabled={submitting} className="flex-1">
          Authorize
        </Button>
        <Button type="submit" variant="secondary" disabled={submitting} className="flex-1">
          Cancel
        </Button>
      </form>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex h-screen w-full items-center justify-center px-4">
      <div className="border-custom-border-200 bg-custom-background-100 shadow-sm w-full max-w-md rounded-lg border p-6">
        <PlaneLogo className="h-7 w-7" />
        <div className="mt-5">{children}</div>
      </div>
    </div>
  );
}
