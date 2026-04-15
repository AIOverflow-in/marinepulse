"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  total: number;
  skip: number;
  limit: number;
  onChange: (skip: number) => void;
}

export function Pagination({ total, skip, limit, onChange }: Props) {
  if (total <= limit) return null;

  const currentPage = Math.floor(skip / limit) + 1;
  const totalPages = Math.ceil(total / limit);
  const from = skip + 1;
  const to = Math.min(skip + limit, total);

  return (
    <div className="flex items-center justify-between mt-4">
      <span className="text-sm text-slate-500">
        {from}–{to} of {total}
      </span>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => onChange(skip - limit)}
          disabled={skip === 0}
        >
          <ChevronLeft className="w-4 h-4" />
          Prev
        </Button>
        <span className="text-sm text-slate-600 px-1">
          {currentPage} / {totalPages}
        </span>
        <Button
          variant="outline"
          size="sm"
          onClick={() => onChange(skip + limit)}
          disabled={skip + limit >= total}
        >
          Next
          <ChevronRight className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}
