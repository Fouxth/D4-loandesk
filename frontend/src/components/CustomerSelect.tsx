import { useState, useMemo, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Check, ChevronsUpDown, Search, User, X } from "lucide-react";
import { cn } from "@/utils/utils";

export interface CustomerSelectOption {
  id: string;
  fullName: string;
  phone?: string | null;
  idCard?: string | null;
}

interface CustomerSelectProps {
  value: string;
  onValueChange: (value: string) => void;
  customers: CustomerSelectOption[];
  placeholder?: string;
  className?: string;
}

export function CustomerSelect({
  value,
  onValueChange,
  customers,
  placeholder = "พิมพ์ค้นหาหรือเลือกลูกค้า...",
  className,
}: CustomerSelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selectedCustomer = useMemo(
    () => customers.find((c) => c.id === value),
    [customers, value]
  );

  const filteredCustomers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return customers;
    return customers.filter(
      (c) =>
        (c.fullName && c.fullName.toLowerCase().includes(q)) ||
        (c.phone && c.phone.includes(q)) ||
        (c.idCard && c.idCard.includes(q))
    );
  }, [customers, search]);

  // Close when clicking outside or pressing Escape
  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (e: MouseEvent | TouchEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  // Focus input when opened
  useEffect(() => {
    if (open) {
      const timer = setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
      return () => clearTimeout(timer);
    } else {
      setSearch("");
    }
  }, [open]);

  return (
    <div ref={containerRef} className="relative w-full">
      <Button
        type="button"
        variant="outline"
        role="combobox"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className={cn(
          "w-full justify-between bg-muted/20 hover:bg-muted/30 border-input h-11 px-3 text-left font-normal rounded-xl transition-colors",
          !selectedCustomer && "text-muted-foreground",
          open && "ring-2 ring-primary/20 border-primary/50",
          className
        )}
      >
        <div className="flex items-center gap-2 truncate">
          <User className="h-4 w-4 shrink-0 opacity-50 text-primary" />
          {selectedCustomer ? (
            <span className="font-semibold text-foreground truncate">
              {selectedCustomer.fullName}
              {selectedCustomer.phone && (
                <span className="ml-2 text-xs font-normal text-muted-foreground">
                  ({selectedCustomer.phone})
                </span>
              )}
            </span>
          ) : (
            <span>{placeholder}</span>
          )}
        </div>
        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
      </Button>

      {open && (
        <div
          className="absolute left-0 right-0 top-full mt-1.5 z-50 rounded-2xl border border-border shadow-2xl overflow-hidden bg-card animate-in fade-in-0 zoom-in-95 duration-150"
          style={{ width: "100%" }}
        >
          <div className="p-2 border-b border-border/50 bg-muted/30">
            <div className="relative flex items-center">
              <Search className="absolute left-3 h-4 w-4 text-muted-foreground pointer-events-none" />
              <Input
                ref={inputRef}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="พิมพ์ชื่อ, เบอร์โทร..."
                className="pl-9 pr-8 h-9 text-xs bg-background rounded-lg border-border/60 focus:ring-primary/20"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  className="absolute right-2 p-1 text-muted-foreground hover:text-foreground rounded"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>

          <div
            className="max-h-56 sm:max-h-64 overflow-y-auto overscroll-contain touch-pan-y [-webkit-overflow-scrolling:touch] p-1 divide-y divide-border/20"
            onTouchMove={(e) => e.stopPropagation()}
            onWheel={(e) => e.stopPropagation()}
          >
            {filteredCustomers.length === 0 ? (
              <div className="py-6 text-center text-xs text-muted-foreground">
                ไม่พบข้อมูลลูกค้าที่ค้นหา
              </div>
            ) : (
              filteredCustomers.map((c) => {
                const isSelected = c.id === value;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => {
                      onValueChange(c.id);
                      setOpen(false);
                      setSearch("");
                    }}
                    className={cn(
                      "w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs text-left transition-colors",
                      isSelected
                        ? "bg-primary/10 text-primary font-bold"
                        : "hover:bg-muted/50 active:bg-muted/70 text-foreground"
                    )}
                  >
                    <div className="flex flex-col min-w-0 pr-2">
                      <span className="font-semibold text-sm truncate">
                        {c.fullName}
                      </span>
                      {c.phone && (
                        <span className="text-[11px] text-muted-foreground truncate">
                          📞 {c.phone}
                        </span>
                      )}
                    </div>
                    {isSelected && (
                      <Check className="h-4 w-4 shrink-0 text-primary font-bold" />
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
