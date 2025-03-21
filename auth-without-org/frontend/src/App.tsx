import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LoginForm } from "@/components/auth/login-form";
import { RegisterForm } from "@/components/auth/register-form";
import { AuthProvider, useAuth } from "@/lib/auth";
import { Toaster } from 'sonner';

function AuthContent() {
  const { user, logout, isLoading } = useAuth();

  if (isLoading) {
    return (
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Loading</CardTitle>
          <CardDescription>Please wait while we initialize...</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (user) {
    return (
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Welcome</CardTitle>
          <CardDescription>You are logged in as {user.email}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={logout} variant="outline" className="w-full">
            Logout
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>Authentication</CardTitle>
        <CardDescription>Login or create an account to continue</CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="login" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="login">Login</TabsTrigger>
            <TabsTrigger value="register">Register</TabsTrigger>
          </TabsList>
          <TabsContent value="login">
            <LoginForm />
          </TabsContent>
          <TabsContent value="register">
            <RegisterForm />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

function App() {
  return (
    <AuthProvider>
      <Toaster richColors closeButton position="top-right" />
      <div className="flex flex-col items-center justify-center min-h-svh p-4">
        <AuthContent />
      </div>
    </AuthProvider>
  );
}

export default App