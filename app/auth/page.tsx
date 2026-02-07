"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { setCurrentRole } from "@/lib/role-storage"
import type { UserRole } from "@/lib/types"
import { Eye, EyeOff } from "lucide-react"

type AuthMode = "signin" | "signup" | "guest"

export default function AuthPage() {
  const router = useRouter()
  const [mode, setMode] = useState<AuthMode>("signin")
  const [showPassword, setShowPassword] = useState(false)

  // Sign in state
  const [signInEmail, setSignInEmail] = useState("")
  const [signInPassword, setSignInPassword] = useState("")

  // Sign up state
  const [signUpName, setSignUpName] = useState("")
  const [signUpEmail, setSignUpEmail] = useState("")
  const [signUpPassword, setSignUpPassword] = useState("")
  const [signUpConfirmPassword, setSignUpConfirmPassword] = useState("")

  const handleSignIn = () => {
    // User will choose role later in portal
    router.push("/portal/status-tracking")
  }

  const handleSignUp = () => {
    if (signUpPassword !== signUpConfirmPassword) {
      alert("Passwords do not match!")
      return
    }
    // User will choose role later in portal
    router.push("/portal/status-tracking")
  }

  const handleGuestLogin = () => {
    // Set guest role as "User" and navigate
    setCurrentRole("User")
    router.push("/portal/status-tracking")
  }

  if (mode === "guest") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-yellow-50 via-white to-yellow-50 dark:from-gray-950 dark:via-gray-900 dark:to-gray-950 p-4">
        <div className="w-full max-w-md">
          <div className="bg-white dark:bg-gray-900 rounded-lg shadow-xl border border-gray-200 dark:border-gray-800 p-8">
            {/* Header */}
            <div className="text-center mb-8">
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
                Être Patisserie
              </h1>
              <p className="text-gray-600 dark:text-gray-400 text-lg">
                Guest Access
              </p>
            </div>

            {/* Guest Confirmation */}
            <div className="space-y-4">
              <p className="text-center text-gray-600 dark:text-gray-400">
                Continue as a guest with limited access?
              </p>

              <Button
                onClick={handleGuestLogin}
                className="w-full h-12 text-base bg-accent text-accent-foreground hover:bg-accent/90"
                size="lg"
              >
                Continue as Guest
              </Button>

              <Button
                onClick={() => setMode("signin")}
                className="w-full h-12 text-base"
                variant="outline"
                size="lg"
              >
                Back to Sign In
              </Button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (mode === "signup") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-yellow-50 via-white to-yellow-50 dark:from-gray-950 dark:via-gray-900 dark:to-gray-950 p-4">
        <div className="w-full max-w-md">
          <div className="bg-white dark:bg-gray-900 rounded-lg shadow-xl border border-gray-200 dark:border-gray-800 p-8">
            {/* Header */}
            <div className="text-center mb-8">
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
                Être Patisserie
              </h1>
              <p className="text-gray-600 dark:text-gray-400 text-lg">
                Create Account
              </p>
            </div>

            {/* Sign Up Form */}
            <div className="space-y-4">
              <div>
                <Label className="text-gray-700 dark:text-gray-300">Name</Label>
                <Input
                  type="text"
                  value={signUpName}
                  onChange={(e) => setSignUpName(e.target.value)}
                  placeholder="Enter your name"
                  className="mt-1"
                />
              </div>

              <div>
                <Label className="text-gray-700 dark:text-gray-300">Email</Label>
                <Input
                  type="email"
                  value={signUpEmail}
                  onChange={(e) => setSignUpEmail(e.target.value)}
                  placeholder="Enter your email"
                  className="mt-1"
                />
              </div>

              <div>
                <Label className="text-gray-700 dark:text-gray-300">Password</Label>
                <div className="relative mt-1">
                  <Input
                    type={showPassword ? "text" : "password"}
                    value={signUpPassword}
                    onChange={(e) => setSignUpPassword(e.target.value)}
                    placeholder="Enter your password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div>
                <Label className="text-gray-700 dark:text-gray-300">Confirm Password</Label>
                <Input
                  type="password"
                  value={signUpConfirmPassword}
                  onChange={(e) => setSignUpConfirmPassword(e.target.value)}
                  placeholder="Confirm your password"
                  className="mt-1"
                />
              </div>

              <Button
                onClick={handleSignUp}
                className="w-full h-12 text-base bg-accent text-accent-foreground hover:bg-accent/90"
                size="lg"
              >
                Sign Up
              </Button>

              <div className="text-center pt-2">
                <button
                  onClick={() => setMode("signin")}
                  className="text-sm text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-colors"
                >
                  Already have an account? <span className="underline underline-offset-4">Sign in</span>
                </button>
              </div>
            </div>

            {/* Footer */}
            <div className="mt-8 pt-6 border-t border-gray-200 dark:border-gray-800">
              <p className="text-xs text-center text-gray-500 dark:text-gray-400">
                Patisserie Order Management System
              </p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-yellow-50 via-white to-yellow-50 dark:from-gray-950 dark:via-gray-900 dark:to-gray-950 p-4">
      <div className="w-full max-w-md">
        <div className="bg-white dark:bg-gray-900 rounded-lg shadow-xl border border-gray-200 dark:border-gray-800 p-8">
          {/* Header */}
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
              Être Patisserie
            </h1>
            <p className="text-gray-600 dark:text-gray-400 text-lg">
              Order Management Portal
            </p>
          </div>

          {/* Sign In Form */}
          <div className="space-y-4">
            <div>
              <Label className="text-gray-700 dark:text-gray-300">Email</Label>
              <Input
                type="email"
                value={signInEmail}
                onChange={(e) => setSignInEmail(e.target.value)}
                placeholder="Enter your email"
                className="mt-1"
              />
            </div>

            <div>
              <Label className="text-gray-700 dark:text-gray-300">Password</Label>
              <div className="relative mt-1">
                <Input
                  type={showPassword ? "text" : "password"}
                  value={signInPassword}
                  onChange={(e) => setSignInPassword(e.target.value)}
                  placeholder="Enter your password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <Button
              onClick={handleSignIn}
              className="w-full h-12 text-base bg-accent text-accent-foreground hover:bg-accent/90"
              size="lg"
            >
              Sign in
            </Button>

            <div className="flex flex-col gap-2 pt-2">
              <div className="text-center">
                <button
                  onClick={() => setMode("signup")}
                  className="text-sm text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-colors"
                >
                  Don't have an account? <span className="underline underline-offset-4">Sign up</span>
                </button>
              </div>
              <div className="text-center">
                <button
                  onClick={() => setMode("guest")}
                  className="text-sm text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white underline underline-offset-4 transition-colors"
                >
                  Sign in as guest
                </button>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="mt-8 pt-6 border-t border-gray-200 dark:border-gray-800">
            <p className="text-xs text-center text-gray-500 dark:text-gray-400">
              Patisserie Order Management System
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
