import { useState } from "react";
import { EyeIcon, EyeOffIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

type PasswordFieldProps = {
  label: string;
  id?: string;
  name?: string;
  value: string;
  onChange: (val: string) => void;
  autoComplete?: string;
  disabled?: boolean;
  placeholder?: string;
  required?: boolean;
};

export default function PasswordField({
  label,
  id = "password",
  name = "password",
  value,
  onChange,
  autoComplete,
  disabled = false,
  placeholder,
  required = false,
}: PasswordFieldProps) {
  const [show, setShow] = useState(false);

  return (
    <div className="space-y-1">
      <FieldLabel htmlFor={id}>
        {label}
        {required ? <span className="text-destructive">*</span> : null}
      </FieldLabel>
      <div className="relative">
        <Input
          id={id}
          name={name}
          type={show ? "text" : "password"}
          value={value}
          autoComplete={autoComplete}
          disabled={disabled}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          className="pr-10"
          required={required}
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          disabled={disabled}
          onMouseDown={() => setShow(true)}
          onMouseUp={() => setShow(false)}
          onMouseLeave={() => setShow(false)}
          className="absolute inset-y-0 right-0"
          aria-label={show ? "Hide password" : "Show password"}
        >
          {show ? (
            <EyeOffIcon className="h-4 w-4" />
          ) : (
            <EyeIcon className="h-4 w-4" />
          )}
        </Button>
      </div>
    </div>
  );
}
