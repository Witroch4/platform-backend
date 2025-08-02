// declarations.d.ts

declare module "*.lottie" {
    const value: any;
    export default value;
}

declare module '@/auth' {
    export const auth: any;
}

declare module '@/lib/prisma' {
    export const prisma: any;
}
