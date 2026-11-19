using System;
using System.Collections.Generic;

namespace Frankenstein.Core
{
    /// <summary>An axis aligned walking collision box in metres. When Round is true the obstacle is the circle inscribed in the (square) box: a trunk.</summary>
    public struct WalkBox
    {
        public double MinX, MaxX, MinZ, MaxZ;
        public bool Round;
    }

    /// <summary>
    /// Circle against axis aligned boxes and round trunks. The position is pushed out of every box it overlaps along the box normal, so the motion
    /// component along the surface survives: the explorer slides around a trunk or wall instead of stopping. Mirrors web view3d-math.js resolveCollisions.
    /// </summary>
    public static class WalkCollision
    {
        public static void Resolve(ref double x, ref double z, double radius, IList<WalkBox> boxes)
        {
            for (int pass = 0; pass < 2; pass++)
            {
                foreach (var b in boxes)
                {
                    if (b.Round)
                    {
                        double mx = (b.MinX + b.MaxX) / 2, mz = (b.MinZ + b.MaxZ) / 2, reach = (b.MaxX - b.MinX) / 2 + radius;
                        double rx = x - mx, rz = z - mz, rd2 = rx * rx + rz * rz;
                        if (rd2 >= reach * reach) continue;
                        if (rd2 < 1e-12) { x = mx + reach; continue; } // dead centre: leave along +x, deterministic
                        double rd = Math.Sqrt(rd2), rk = reach / rd;
                        x = mx + rx * rk; z = mz + rz * rk;
                        continue;
                    }
                    double cx = Math.Min(Math.Max(x, b.MinX), b.MaxX), cz = Math.Min(Math.Max(z, b.MinZ), b.MaxZ);
                    double dx = x - cx, dz = z - cz, d2 = dx * dx + dz * dz;
                    if (d2 >= radius * radius) continue;
                    if (d2 > 1e-9) { double d = Math.Sqrt(d2), k = (radius - d) / d; x += dx * k; z += dz * k; continue; }
                    // centre is inside the box: leave through the nearest face
                    double left = x - b.MinX, right = b.MaxX - x, back = z - b.MinZ, front = b.MaxZ - z;
                    double m = Math.Min(Math.Min(left, right), Math.Min(back, front));
                    if (m == left) x -= left + radius;
                    else if (m == right) x += right + radius;
                    else if (m == back) z -= back + radius;
                    else z += front + radius;
                }
            }
        }
    }
}
