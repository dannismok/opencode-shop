import { Router } from 'express';
import { z } from 'zod';
import type { Deps } from '../container';
import { assertSchema, badRequest, conflict, notFound } from '../lib/errors';
import { createAuthMiddleware } from '../middleware/auth';
import { createUploadMiddleware } from '../middleware/upload';
import { TokenService } from '../services/tokenService';
import { LocalDiskStorageProvider } from '../services/storage/StorageProvider';
import type { Food } from '@prisma/client';

const createFoodSchema = z.object({
  name: z.string().min(2).max(120),
  description: z.string().min(1).max(1000),
  category: z.string().min(1).max(80),
  priceCents: z.number().int().min(0),
  stockQty: z.number().int().min(0).optional().default(0),
  imageUrl: z.string().optional(),
  isActive: z.boolean().optional().default(true),
});

const updateFoodSchema = z
  .object({
    name: z.string().min(2).max(120).optional(),
    description: z.string().min(1).max(1000).optional(),
    category: z.string().min(1).max(80).optional(),
    priceCents: z.number().int().min(0).optional(),
    imageUrl: z.string().optional(),
    isActive: z.boolean().optional(),
  })
  .refine((d) => Object.keys(d).length > 0, 'Provide at least one field to update');

const setStockSchema = z.object({
  mode: z.literal('set'),
  qty: z.number().int().min(0),
});

const adjustStockSchema = z.object({
  mode: z.literal('adjust'),
  delta: z.number().int().refine((d) => d !== 0, 'delta must be non-zero'),
  reason: z.string().min(1).max(500),
});

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

export function serializeFood(food: Food) {
  return {
    id: food.id,
    name: food.name,
    slug: food.slug,
    description: food.description,
    category: food.category,
    priceCents: food.priceCents,
    imageUrl: food.imageUrl,
    stockQty: food.stockQty,
    isActive: food.isActive,
    inStock: food.stockQty > 0,
    createdAt: food.createdAt,
    updatedAt: food.updatedAt,
  };
}

export function foodsRouter(deps: Deps) {
  const router = Router();
  const tokenService = new TokenService(deps.prisma, deps.env);
  const { requireAuth, requireAdmin } = createAuthMiddleware({ prisma: deps.prisma, tokenService });
  const upload = createUploadMiddleware(deps.env);
  const storage = new LocalDiskStorageProvider(deps.env.UPLOAD_DIR);

  router.get('/foods', async (_req, res, next) => {
    try {
      const foods = await deps.prisma.food.findMany({
        where: { isActive: true },
        orderBy: { name: 'asc' },
      });
      res.json({ foods: foods.map(serializeFood) });
    } catch (err) {
      next(err);
    }
  });

  router.get('/foods/:slug', async (req, res, next) => {
    try {
      const food = await deps.prisma.food.findUnique({ where: { slug: req.params.slug } });
      if (!food || !food.isActive) {
        throw notFound('Food item not found');
      }
      res.json({ food: serializeFood(food) });
    } catch (err) {
      next(err);
    }
  });

  const admin = Router();

  admin.get('/', async (_req, res, next) => {
    try {
      const foods = await deps.prisma.food.findMany({
        orderBy: { name: 'asc' },
        include: { _count: { select: { stockMovements: true } } },
      });
      res.json({
        foods: foods.map((f) => ({ ...serializeFood(f), movementCount: f._count.stockMovements })),
      });
    } catch (err) {
      next(err);
    }
  });

  admin.post('/', async (req, res, next) => {
    try {
      const data = assertSchema(createFoodSchema, req.body);
      const slug = await uniqueSlug(data.name);
      const food = await deps.prisma.food.create({
        data: {
          name: data.name,
          slug,
          description: data.description,
          category: data.category,
          priceCents: data.priceCents,
          stockQty: data.stockQty,
          imageUrl: data.imageUrl ?? '/uploads/foods/placeholder.svg',
          isActive: data.isActive,
        },
      });
      if (food.stockQty > 0) {
        await deps.prisma.stockMovement.create({
          data: {
            foodId: food.id,
            delta: food.stockQty,
            reason: 'INITIAL_STOCK',
            actorUserId: req.user!.id,
          },
        });
      }
      res.status(201).json({ food: serializeFood(food) });
    } catch (err) {
      next(err);
    }
  });

  async function uniqueSlug(name: string): Promise<string> {
    const base = slugify(name) || 'food';
    let slug = base;
    let i = 2;
    while (await deps.prisma.food.findUnique({ where: { slug } })) {
      slug = `${base}-${i}`;
      i++;
    }
    return slug;
  }

  admin.get('/:id', async (req, res, next) => {
    try {
      const food = await deps.prisma.food.findUnique({ where: { id: req.params.id } });
      if (!food) throw notFound('Food item not found');
      res.json({ food: serializeFood(food) });
    } catch (err) {
      next(err);
    }
  });

  admin.patch('/:id', async (req, res, next) => {
    try {
      const data = assertSchema(updateFoodSchema, req.body);
      const food = await deps.prisma.food.findUnique({ where: { id: req.params.id } });
      if (!food) throw notFound('Food item not found');

      const patch: Record<string, unknown> = { ...data };
      if (data.name && data.name !== food.name) {
        patch.slug = await uniqueSlug(data.name);
      }
      const updated = await deps.prisma.food.update({ where: { id: food.id }, data: patch });
      res.json({ food: serializeFood(updated) });
    } catch (err) {
      next(err);
    }
  });

  admin.delete('/:id', async (req, res, next) => {
    try {
      const food = await deps.prisma.food.findUnique({ where: { id: req.params.id } });
      if (!food) throw notFound('Food item not found');
      const updated = await deps.prisma.food.update({
        where: { id: food.id },
        data: { isActive: false },
      });
      res.json({ food: serializeFood(updated) });
    } catch (err) {
      next(err);
    }
  });

  admin.post('/:id/image', upload.single('image'), async (req, res, next) => {
    try {
      const food = await deps.prisma.food.findUnique({ where: { id: req.params.id } });
      if (!food) throw notFound('Food item not found');
      if (!req.file) throw badRequest('No image file provided (field name: image)');

      const url = await storage.save(req.file.buffer, food.slug, req.file.mimetype);
      const oldUrl = food.imageUrl;
      const updated = await deps.prisma.food.update({
        where: { id: food.id },
        data: { imageUrl: url },
      });
      if (oldUrl && oldUrl.startsWith('/uploads/foods/') && oldUrl !== url) {
        await storage.delete(oldUrl).catch(() => undefined);
      }
      res.json({ food: serializeFood(updated) });
    } catch (err) {
      next(err);
    }
  });

  admin.patch('/:id/stock', async (req, res, next) => {
    try {
      const food = await deps.prisma.food.findUnique({ where: { id: req.params.id } });
      if (!food) throw notFound('Food item not found');

      if (req.body.mode === 'set') {
        const { qty } = assertSchema(setStockSchema, req.body);
        const delta = qty - food.stockQty;
        const updated = await deps.prisma.food.update({
          where: { id: food.id },
          data: { stockQty: qty },
        });
        await deps.prisma.stockMovement.create({
          data: {
            foodId: food.id,
            delta,
            reason: 'ADMIN_SET',
            actorUserId: req.user!.id,
          },
        });
        res.json({ food: serializeFood(updated) });
        return;
      }

      const { delta, reason } = assertSchema(adjustStockSchema, req.body);
      const newQty = food.stockQty + delta;
      if (newQty < 0) {
        throw conflict('Stock cannot go below zero', 'INVALID_STOCK', {
          current: food.stockQty,
          delta,
        });
      }
      const updated = await deps.prisma.food.update({
        where: { id: food.id },
        data: { stockQty: newQty },
      });
      await deps.prisma.stockMovement.create({
        data: {
          foodId: food.id,
          delta,
          reason,
          actorUserId: req.user!.id,
        },
      });
      res.json({ food: serializeFood(updated) });
    } catch (err) {
      next(err);
    }
  });

  router.use('/admin/foods', requireAuth, requireAdmin, admin);
  return router;
}
