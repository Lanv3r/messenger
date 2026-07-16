type ImagePreviewDialogProps = {
  src: string;
  alt: string;
  onClose: () => void;
};

export function ImagePreviewDialog({
  src,
  alt,
  onClose,
}: ImagePreviewDialogProps) {
  return (
    <div
      className="image-viewer-backdrop"
      role="presentation"
      onClick={(event) => {
        event.stopPropagation();
        onClose();
      }}
    >
      <section
        className="image-viewer-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Image preview"
        onClick={(event) => event.stopPropagation()}
      >
        <img src={src} alt={alt} />
      </section>
    </div>
  );
}
