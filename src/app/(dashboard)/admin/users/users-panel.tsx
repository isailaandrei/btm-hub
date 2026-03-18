"use client";

import { useAdminData } from "../admin-data-provider";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from "@/components/ui/table";

export function UsersPanel() {
  const { profiles } = useAdminData();

  if (profiles === null) {
    return (
      <div className="animate-pulse">
        <div className="mb-6 h-8 w-32 rounded bg-muted" />
        <div className="mb-4 h-5 w-40 rounded bg-muted" />
        <div className="rounded-lg border border-border">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex gap-4 border-b border-border px-4 py-4 last:border-0">
              <div className="h-4 w-32 rounded bg-muted" />
              <div className="h-4 w-48 rounded bg-muted" />
              <div className="h-4 w-20 rounded bg-muted" />
              <div className="h-4 w-24 rounded bg-muted" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div>
      <h1 className="mb-6 text-[length:var(--font-size-h2)] font-medium text-foreground">
        Users
      </h1>

      <p className="mb-4 text-sm text-muted-foreground">
        {profiles.length} registered user{profiles.length !== 1 ? "s" : ""}
      </p>

      {profiles.length === 0 ? (
        <div className="rounded-lg border border-border bg-card p-8 text-center text-muted-foreground">
          No users registered yet.
        </div>
      ) : (
        <div className="rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow className="bg-card text-muted-foreground">
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Joined</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {profiles.map((profile) => (
                <TableRow key={profile.id}>
                  <TableCell className="font-medium text-foreground">
                    {profile.display_name || "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {profile.email}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={profile.role === "admin" ? "default" : "secondary"}
                      className="capitalize"
                    >
                      {profile.role}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {new Date(profile.created_at).toLocaleDateString("en-US", {
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                    })}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
