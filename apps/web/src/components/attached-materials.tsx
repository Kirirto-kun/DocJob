'use client';

import { useState } from 'react';
import type { Patient, PatientImage } from '@/hooks/use-patient-store';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';

type AttachedMaterialsProps = {
  patient: Patient;
};

export default function AttachedMaterials({ patient }: AttachedMaterialsProps) {
  const images = patient.attachedImages ?? patient.images ?? [];
  const [activeImage, setActiveImage] = useState<PatientImage | null>(null);

  return (
    <Card className="bg-muted/40 border-border/40">
      <CardHeader>
        <CardTitle>Прикреплённые материалы</CardTitle>
        <CardDescription>
          {images.length > 0 ? `Материалов: ${images.length}` : 'Нет материалов'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {images.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground py-6">
            Материалы к кейсу не прикреплены
          </p>
        ) : (
          <div className="grid grid-cols-3 md:grid-cols-4 gap-2">
            {images.map((image) => (
              <button
                key={image.id}
                type="button"
                onClick={() => setActiveImage(image)}
                className="aspect-square overflow-hidden rounded-md border border-border/40 bg-background/50 transition hover:border-primary focus:border-primary focus:outline-none"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={image.url}
                  alt={image.filename}
                  className="object-cover w-full h-full rounded-md"
                />
              </button>
            ))}
          </div>
        )}
      </CardContent>

      <Dialog open={activeImage !== null} onOpenChange={(open) => !open && setActiveImage(null)}>
        <DialogContent className="max-w-4xl p-2">
          <DialogTitle className="sr-only">
            {activeImage?.filename ?? 'Материал'}
          </DialogTitle>
          {activeImage && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={activeImage.url}
              alt={activeImage.filename}
              className="w-full h-auto rounded-md"
            />
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}
