import type { GenerateUiErrorVm } from "./generate.types"

type GenerateErrorBannerProps = {
  errors: GenerateUiErrorVm[]
}

export function GenerateErrorBanner({ errors }: GenerateErrorBannerProps) {
  if (errors.length === 0) {
    return null
  }

  return (
    <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
      <div className="flex flex-col gap-2">
        {errors.map((error, index) => (
          <p key={`${error.scope}-${index}`}>{error.message}</p>
        ))}
      </div>
    </div>
  )
}
