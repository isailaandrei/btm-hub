"use client";

import { useActionState, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatEuroCents } from "@/lib/shop/money";
import type { ShopShippingZoneWithRates } from "@/lib/shop/types";
import {
  loadShopShippingDataAction,
  saveShippingZoneRateFormAction,
  type ShopAdminFormState,
} from "./actions";

const DEFAULT_ZONES = [
  {
    name: "Portugal",
    slug: "portugal",
    countries: "PT",
    price: "5.00",
    description: "Tracked shipping within Portugal.",
  },
  {
    name: "European Union",
    slug: "european-union",
    countries: "AT, BE, BG, CY, CZ, DE, DK, EE, ES, FI, FR, GR, HR, HU, IE, IT, LT, LU, LV, MT, NL, PL, RO, SE, SI, SK",
    price: "12.00",
    description: "Tracked shipping across the EU.",
  },
  {
    name: "United Kingdom",
    slug: "united-kingdom",
    countries: "GB",
    price: "15.00",
    description: "Tracked UK shipping.",
  },
  {
    name: "United States and Canada",
    slug: "north-america",
    countries: "US, CA",
    price: "24.00",
    description: "Tracked shipping to the US and Canada.",
  },
  {
    name: "Rest of world",
    slug: "rest-of-world",
    countries: "AD, AE, AL, AM, AR, AU, BA, BR, CH, CL, CN, HK, IS, JP, KR, LI, MA, MC, MX, NO, NZ, RS, SG, TR, UA, ZA",
    price: "32.00",
    description: "Tracked shipping to supported international destinations.",
  },
];

const initialState: ShopAdminFormState = {
  errors: null,
  message: null,
  success: false,
  resetKey: 0,
};

function inputClassName() {
  return "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary disabled:opacity-60";
}

function selectClassName() {
  return "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-primary disabled:opacity-60";
}

function ZoneRateForm({
  zone,
  template,
  onSaved,
}: {
  zone: ShopShippingZoneWithRates | null;
  template: (typeof DEFAULT_ZONES)[number];
  onSaved: () => Promise<void>;
}) {
  const [state, formAction, isPending] = useActionState(
    saveShippingZoneRateFormAction,
    initialState,
  );
  const handledResetKeyRef = useRef(0);
  const rate = zone?.rates[0] ?? null;

  useEffect(() => {
    if (!state.success) return;
    if (state.resetKey === handledResetKeyRef.current) return;
    handledResetKeyRef.current = state.resetKey;
    void onSaved();
  }, [onSaved, state.resetKey, state.success]);

  return (
    <form action={formAction} className="grid gap-4 rounded-lg border border-border p-4">
      <input type="hidden" name="zoneId" value={zone?.id ?? ""} />
      <input type="hidden" name="rateId" value={rate?.id ?? ""} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-medium text-foreground">{zone?.name ?? template.name}</h3>
          <p className="text-sm text-muted-foreground">
            {zone ? `${zone.allowed_countries.length} countries` : "Preset zone"}
          </p>
        </div>
        <Badge variant={zone?.active === false ? "outline" : "default"}>
          {zone?.active === false ? "Inactive" : "Active"}
        </Badge>
      </div>

      <div className="grid gap-4 md:grid-cols-[1fr_0.7fr_0.5fr]">
        <label className="text-sm font-medium">
          Zone name
          <input
            name="name"
            defaultValue={zone?.name ?? template.name}
            className={inputClassName()}
            disabled={isPending}
          />
        </label>
        <label className="text-sm font-medium">
          Slug
          <input
            name="slug"
            defaultValue={zone?.slug ?? template.slug}
            className={inputClassName()}
            disabled={isPending}
          />
        </label>
        <label className="text-sm font-medium">
          Sort
          <input
            name="sortOrder"
            type="number"
            min="0"
            defaultValue={zone?.sort_order ?? DEFAULT_ZONES.indexOf(template)}
            className={inputClassName()}
            disabled={isPending}
          />
        </label>
      </div>

      <label className="text-sm font-medium">
        Country codes
        <textarea
          name="allowedCountries"
          defaultValue={zone?.allowed_countries.join(", ") ?? template.countries}
          className={inputClassName()}
          rows={3}
          disabled={isPending}
        />
      </label>

      <div className="grid gap-4 md:grid-cols-[1fr_0.7fr_0.7fr]">
        <label className="text-sm font-medium">
          Rate name
          <input
            name="rateName"
            defaultValue={rate?.name ?? "Standard tracked shipping"}
            className={inputClassName()}
            disabled={isPending}
          />
        </label>
        <label className="text-sm font-medium">
          EUR price
          <input
            name="ratePrice"
            defaultValue={
              rate ? (rate.price_cents / 100).toFixed(2) : template.price
            }
            className={inputClassName()}
            disabled={isPending}
          />
        </label>
        <label className="text-sm font-medium">
          Tax behavior
          <select
            name="rateTaxBehavior"
            defaultValue={rate?.tax_behavior ?? "exclusive"}
            className={selectClassName()}
            disabled={isPending}
          >
            <option value="exclusive">Exclusive</option>
            <option value="inclusive">Inclusive</option>
          </select>
        </label>
      </div>

      <div className="grid gap-4 md:grid-cols-[1fr_0.7fr]">
        <label className="text-sm font-medium">
          Rate description
          <input
            name="rateDescription"
            defaultValue={rate?.description ?? template.description}
            className={inputClassName()}
            disabled={isPending}
          />
        </label>
        <label className="text-sm font-medium">
          Stripe tax code
          <input
            name="rateStripeTaxCode"
            defaultValue={rate?.stripe_tax_code ?? ""}
            className={inputClassName()}
            disabled={isPending}
          />
        </label>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              name="active"
              defaultChecked={zone?.active ?? true}
              disabled={isPending}
            />
            Zone active
          </label>
          <label className="flex items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              name="rateActive"
              defaultChecked={rate?.active ?? true}
              disabled={isPending}
            />
            Rate active
          </label>
          {rate ? (
            <span className="text-sm text-muted-foreground">
              Current: {formatEuroCents(rate.price_cents)}
            </span>
          ) : null}
        </div>
        <div className="flex items-center gap-3">
          {state.message ? (
            <p className={`text-sm ${state.success ? "text-primary" : "text-destructive"}`}>
              {state.message}
            </p>
          ) : null}
          <Button type="submit" disabled={isPending}>
            {isPending ? "Saving..." : "Save zone"}
          </Button>
        </div>
      </div>
    </form>
  );
}

export function ShippingRatesPanel() {
  const [zones, setZones] = useState<ShopShippingZoneWithRates[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadZones = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await loadShopShippingDataAction();
      setZones(data.zones);
      setError(null);
    } catch (loadError) {
      const message =
        loadError instanceof Error
          ? loadError.message
          : "Failed to load shipping zones.";
      setError(message);
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadZones();
  }, [loadZones]);

  const zonesBySlug = useMemo(
    () => new Map(zones.map((zone) => [zone.slug, zone])),
    [zones],
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Shipping</CardTitle>
        <CardDescription>
          {isLoading
            ? "Loading shipping zones..."
            : `${zones.length} configured zone${zones.length === 1 ? "" : "s"}`}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error ? (
          <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        ) : null}

        {DEFAULT_ZONES.map((template) => (
          <ZoneRateForm
            key={template.slug}
            zone={zonesBySlug.get(template.slug) ?? null}
            template={template}
            onSaved={loadZones}
          />
        ))}

        {zones
          .filter((zone) => !DEFAULT_ZONES.some((template) => template.slug === zone.slug))
          .map((zone) => (
            <ZoneRateForm
              key={zone.id}
              zone={zone}
              template={{
                name: zone.name,
                slug: zone.slug,
                countries: zone.allowed_countries.join(", "),
                price: zone.rates[0]
                  ? (zone.rates[0].price_cents / 100).toFixed(2)
                  : "0.00",
                description: zone.rates[0]?.description ?? "",
              }}
              onSaved={loadZones}
            />
          ))}
      </CardContent>
    </Card>
  );
}
