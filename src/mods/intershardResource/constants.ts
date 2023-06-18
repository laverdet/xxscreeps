export const SUBSCRIPTION_TOKEN = "token" as const
export const CPU_UNLOCK = "cpuUnlock" as const
export const PIXEL = "pixel" as const
export const ACCESS_KEY = "accessKey" as const

export const PIXEL_CPU_COST = 10000 as const

export const INTERSHARD_RESOURCES = [
    SUBSCRIPTION_TOKEN,
    CPU_UNLOCK,
    PIXEL,
    ACCESS_KEY,
] as const;
