import { useState, useMemo } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Check, ChevronsUpDown, Search, User } from "lucide-react";
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

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn(
            "w-full justify-between bg-muted/20 hover:bg-muted/30 border-input h-11 px-3 text-left font-normal rounded-xl transition-colors",
            !selectedCustomer && "text-muted-foreground",
            className
          )}
        >
          <div className="flex items-center gap-2 truncate">
            <User className="h-4 w-4 shrink-0 opacity-50" />
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
      </PopoverTrigger>

      <PopoverContent
        align="start"
        className="w-[var(--radix-popover-trigger-width)] p-0 rounded-2xl border-border shadow-xl overflow-hidden bg-card"
      >
        <div className="p-2 border-b border-border/50 bg-muted/20">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="พิมพ์ชื่อ, เบอร์โทร..."
              className="pl-9 h-9 text-xs bg-background rounded-lg border-border/60 focus:ring-primary/20"
              autoFocus
            />
          </div>
        </div>

        <div className="max-h-60 overflow-y-auto p-1 divide-y divide-border/20">
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
                      : "hover:bg-muted/50 text-foreground"
                  )}
                >
                  <div className="flex flex-col min-w-0 pr-2">
                    <span className="font-semibold text-sm truncate">{c.fullName}</span>
                    {c.phone && (
                      <span className="text-[11px] text-muted-foreground truncate">
                        📞 {c.phone}
                      </span>
                    )}
                  </div>
                  {isSelected && <Check className="h-4 w-4 shrink-0 text-primary" />}
                </button>
              );
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
