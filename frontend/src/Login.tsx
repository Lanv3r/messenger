import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertCircleIcon } from "lucide-react";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import PasswordField from "@/components/PasswordField";
import { apiFetch } from "@/lib/api";

type LoginProps = {
  onSuccess: (user: LoginResponse) => void;
  onGoToSignup: () => void;
};

type LoginResponse = {
  id: number;
  username: string;
  first_name: string;
  last_name: string | null;
};

export default function Login({ onSuccess, onGoToSignup }: LoginProps) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      if (!username.trim()) {
        throw new Error("Username is required.");
      }
      if (!password) {
        throw new Error("Password is required.");
      }

      const response = await apiFetch<LoginResponse>("/login", {
        method: "POST",
        body: JSON.stringify({ username, password }),
      });
      onSuccess(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-muted flex min-h-svh items-center justify-center p-6 md:p-10">
      <div className="flex w-full max-w-sm flex-col gap-6 justify-center">
        <div className="flex items-center gap-3 self-center font-medium">
          <Avatar className="size-10 rounded-lg">
            <AvatarImage src="/favicon.svg" alt="Messenger logo" />
            <AvatarFallback>M</AvatarFallback>
          </Avatar>
          Messenger
        </div>
        <main>
          <Card className="w-full max-w-sm">
            <CardHeader>
              <CardTitle className="text-xl">Welcome back</CardTitle>
            </CardHeader>
            <CardContent>
              <form id="login-form" onSubmit={handleLogin}>
                <FieldGroup>
                  <FieldGroup>
                    <Field>
                      <FieldLabel htmlFor="username">
                        Username <span className="text-destructive">*</span>
                      </FieldLabel>
                      <Input
                        id="username"
                        type="text"
                        value={username}
                        placeholder="janedoe@gmail.com"
                        autoComplete="username"
                        onChange={(event) => setUsername(event.target.value)}
                        required
                      />
                    </Field>
                    <Field>
                      <PasswordField
                        id="login-password"
                        label="Password"
                        value={password}
                        onChange={setPassword}
                        autoComplete="current-password"
                        required
                      />
                    </Field>
                  </FieldGroup>
                  {error && (
                    <Alert variant="destructive">
                      <AlertCircleIcon />
                      <AlertTitle>Unable to process your login.</AlertTitle>
                      <AlertDescription>
                        <p>Please verify your information and try again.</p>
                        <ul className="list-inside list-disc text-sm">
                          <li>{error}</li>
                        </ul>
                      </AlertDescription>
                    </Alert>
                  )}
                  <FieldGroup>
                    <Field>
                      <Button type="submit" disabled={loading}>
                        {loading ? "Logging in…" : "Login"}
                      </Button>
                      <FieldDescription className="px-6 text-center text-sm text-muted-foreground">
                        Don’t have an account?{" "}
                        <button
                          type="button"
                          onClick={onGoToSignup}
                          className="font-medium text-primary underline-offset-4 underline hover:text-primary/70"
                        >
                          Sign up
                        </button>
                      </FieldDescription>
                    </Field>
                  </FieldGroup>
                </FieldGroup>
              </form>
            </CardContent>
          </Card>
        </main>
      </div>
    </div>
  );
}
