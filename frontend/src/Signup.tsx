import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertCircleIcon, CheckCircle2Icon, XCircleIcon } from "lucide-react";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { AvatarUploadField } from "@/components/AvatarUploadField";
import PasswordField from "@/components/PasswordField";
import { apiFetch } from "@/lib/api";

type SignupResponse = {
  id: number;
  username: string;
  first_name: string;
  last_name: string | null;
};

type SignupProps = {
  onSuccess: (user: SignupResponse) => void;
  onGoToLogin: () => void;
};

type UsernameAvailabilityResponse = {
  available: boolean;
  message: string;
};

type UsernameStatus = "idle" | "checking" | "available" | "unavailable";

export default function Signup({ onSuccess, onGoToLogin }: SignupProps) {
  const [username, setUsername] = useState("");
  const [usernameStatus, setUsernameStatus] =
    useState<UsernameStatus>("idle");
  const [usernameMessage, setUsernameMessage] = useState<string | null>(null);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [bio, setBio] = useState("");
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState("/favicon.svg");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const passwordsMatch = password === confirmPassword && password.length > 0;
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const value = username.trim();

    if (!value) {
      setUsernameStatus("idle");
      setUsernameMessage(null);
      return;
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      setUsernameStatus("checking");
      setUsernameMessage("Checking username...");

      try {
        const result = await apiFetch<UsernameAvailabilityResponse>(
          `/users/username-availability?username=${encodeURIComponent(value)}`,
          {
            signal: controller.signal,
          },
        );

        setUsernameStatus(result.available ? "available" : "unavailable");
        setUsernameMessage(result.message);
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }

        setUsernameStatus("unavailable");
        setUsernameMessage("Could not check username right now.");
      }
    }, 350);

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [username]);

  useEffect(() => {
    if (!avatarFile) {
      setAvatarPreviewUrl("/favicon.svg");
      return;
    }

    const objectUrl = URL.createObjectURL(avatarFile);
    setAvatarPreviewUrl(objectUrl);

    return () => URL.revokeObjectURL(objectUrl);
  }, [avatarFile]);

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      if (!username.trim()) {
        throw new Error("Username is required.");
      }
      if (username.trim().length < 5) {
        throw new Error("Username must be at least 5 characters.");
      }
      if (usernameStatus !== "available") {
        throw new Error("Please choose an available username.");
      }
      if (!firstName.trim()) {
        throw new Error("First name is required.");
      }
      if (!password) {
        throw new Error("Password is required.");
      }
      if (password.length < 8) {
        throw new Error("Password must be at least 8 characters long.");
      }
      if (!passwordsMatch) {
        throw new Error("Passwords must match.");
      }

      const formData = new FormData();
      formData.append("username", username.trim());
      formData.append("password", password);
      formData.append("first_name", firstName.trim());
      formData.append("last_name", lastName.trim());
      formData.append("bio", bio.trim());
      if (avatarFile) {
        formData.append("avatar", avatarFile);
      }

      const response = await apiFetch<SignupResponse>("/signup", {
        method: "POST",
        body: formData,
      });
      onSuccess(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-muted flex min-h-svh flex-col items-center justify-center gap-6 p-6 md:p-10">
      <div className="flex w-full max-w-sm flex-col gap-6">
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
              <CardTitle>Create an account</CardTitle>
            </CardHeader>
            <CardContent>
              <form id="signup-form" onSubmit={handleSignup} className="text-left">
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
                    {usernameStatus === "idle" ? (
                      <FieldDescription>
                        Required. Must be 5-32 characters.
                      </FieldDescription>
                    ) : (
                      <FieldDescription
                        className={`flex items-center gap-1.5 ${
                          usernameStatus === "available"
                            ? "text-green-600"
                            : usernameStatus === "unavailable"
                              ? "text-destructive"
                              : "text-muted-foreground"
                        }`}
                      >
                        {usernameStatus === "available" ? (
                          <CheckCircle2Icon className="size-4" />
                        ) : usernameStatus === "unavailable" ? (
                          <XCircleIcon className="size-4" />
                        ) : null}
                        {usernameMessage}
                      </FieldDescription>
                    )}
                  </Field>
                  <FieldSet className="gap-2">
                    <FieldLegend variant="label" className="text-left">
                      Display name
                    </FieldLegend>
                    <div className="border-l border-border pl-4">
                      <FieldGroup>
                      <Field>
                        <FieldLabel htmlFor="first-name">
                          First name <span className="text-destructive">*</span>
                        </FieldLabel>
                        <Input
                          id="first-name"
                          type="text"
                          value={firstName}
                          maxLength={64}
                          autoComplete="given-name"
                          onChange={(event) => setFirstName(event.target.value)}
                          required
                        />
                      </Field>
                      <Field>
                        <FieldLabel htmlFor="last-name">
                          Last name{" "}
                          <span className="text-muted-foreground">
                            (optional)
                          </span>
                        </FieldLabel>
                        <Input
                          id="last-name"
                          type="text"
                          value={lastName}
                          maxLength={64}
                          autoComplete="family-name"
                          onChange={(event) => setLastName(event.target.value)}
                        />
                      </Field>
                      </FieldGroup>
                    </div>
                  </FieldSet>
                  <Field>
                    <FieldLabel htmlFor="bio">
                      Bio{" "}
                      <span className="text-muted-foreground">(optional)</span>
                    </FieldLabel>
                    <Input
                      id="bio"
                      type="text"
                      value={bio}
                      maxLength={70}
                      onChange={(event) => setBio(event.target.value)}
                    />
                    <FieldDescription>Up to 70 characters.</FieldDescription>
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="avatar-file">
                      Avatar image{" "}
                      <span className="text-muted-foreground">(optional)</span>
                    </FieldLabel>
                    <AvatarUploadField
                      id="avatar-file"
                      label="Profile picture"
                      previewUrl={avatarPreviewUrl}
                      helperText="Optional. PNG, JPEG, WebP, or GIF."
                      onFileChange={setAvatarFile}
                    />
                  </Field>
                  <Field>
                    <PasswordField
                      id="signup-password"
                      label="Password"
                      value={password}
                      onChange={setPassword}
                      autoComplete="new-password"
                      required
                    />
                    <FieldDescription>
                      Required. Must be at least 8 characters long.
                    </FieldDescription>
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="confirm-password">
                      Confirm password{" "}
                      <span className="text-destructive">*</span>
                    </FieldLabel>
                    <Input
                      id="confirm-password"
                      type="password"
                      value={confirmPassword}
                      autoComplete="new-password"
                      onChange={(event) =>
                        setConfirmPassword(event.target.value)
                      }
                      required
                    />
                    <FieldDescription>
                      Please confirm your password.
                    </FieldDescription>
                    {!passwordsMatch &&
                      confirmPassword.length > 0 &&
                      password.length > 0 && (
                        <FieldDescription className="text-red-600">
                          Passwords must match.
                        </FieldDescription>
                      )}
                  </Field>
                  {error && (
                    <Alert variant="destructive">
                      <AlertCircleIcon />
                      <AlertTitle>Unable to process your signup.</AlertTitle>
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
                      <Button
                        type="submit"
                        disabled={loading || !passwordsMatch}
                      >
                        {loading ? "Creating account…" : "Create account"}
                      </Button>
                      <FieldDescription className="px-6 text-center text-sm text-muted-foreground">
                        Already have an account?{" "}
                        <button
                          type="button"
                          onClick={onGoToLogin}
                          className="font-medium text-primary underline-offset-4 underline hover:text-primary/70"
                        >
                          Sign in
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
