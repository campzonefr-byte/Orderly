import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../prisma/prisma.service';
import * as bcrypt from 'bcrypt';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
  ) {}

  async login(email: string, password: string) {
    const user = await this.prisma.user.findUnique({
      where: { email },
      include: { storeAccess: true },
    });

    if (!user) throw new UnauthorizedException('No account found with that email.');

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) throw new UnauthorizedException('Incorrect password.');

    const token = this.jwt.sign({ sub: user.id, email: user.email });

    return {
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        storeIds: user.storeAccess.map((a) => a.storeId),
        permissions: user.permissions ?? [],
      },
    };
  }

  async seedAdmin() {
    const existing = await this.prisma.user.findUnique({
      where: { email: 'admin@orderly.app' },
    });
    if (existing) return { message: 'Admin already exists' };

    const hash = await bcrypt.hash('admin123', 10);
    await this.prisma.user.create({
      data: {
        name: 'Yassine Amri',
        email: 'admin@orderly.app',
        passwordHash: hash,
        role: 'SUPER_ADMIN',
      },
    });
    return { message: 'Admin seeded' };
  }
  async seedStores() {
    const stores = [
      { name: "Aura Beauty", sourceType: "SHOPIFY" as const },
      { name: "Nomad Goods", sourceType: "SHOPIFY" as const },
      { name: "Pulse Electronics", sourceType: "CUSTOM" as const },
      { name: "Verde Home", sourceType: "SHOPIFY" as const },
      { name: "Atlas Outdoor", sourceType: "MARKETPLACE" as const },
    ];
  
    const created: string[] = [];
    for (const store of stores) {
      const existing = await this.prisma.store.findFirst({
        where: { name: store.name },
      });
      if (!existing) {
        const s = await this.prisma.store.create({ data: store });
        created.push(s.name);
      }
    }
    return { seeded: created };
  }
}