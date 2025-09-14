import torch
import torch.nn as nn
import torch.optim as optim
from torch.utils.data import DataLoader
from torchvision import datasets, transforms
import timm

# 1. Config
DATA_DIR = "dataset"
BATCH_SIZE = 32
EPOCHS = 40
LR = 1e-4
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"

# 2. Transforms
transform = transforms.Compose([
    transforms.Resize((224, 224)),
    transforms.ToTensor(),
    transforms.Normalize([0.485, 0.456, 0.406],
                         [0.229, 0.224, 0.225])
])

train_dataset = datasets.ImageFolder(f"{DATA_DIR}/train", transform=transform)
val_dataset   = datasets.ImageFolder(f"{DATA_DIR}/val", transform=transform)

train_loader = DataLoader(train_dataset, batch_size=BATCH_SIZE, shuffle=True)
val_loader   = DataLoader(val_dataset, batch_size=BATCH_SIZE)

# 3. Model
num_classes = len(train_dataset.classes)
model = timm.create_model("efficientnet_b0", pretrained=True, num_classes=num_classes)
model = model.to(DEVICE)

# 4. Loss & Optimizer
criterion = nn.CrossEntropyLoss()
optimizer = optim.Adam(model.parameters(), lr=LR)

# 5. Training loop
for epoch in range(EPOCHS):
    model.train()
    total_loss = 0
    for images, labels in train_loader:
        images, labels = images.to(DEVICE), labels.to(DEVICE)
        optimizer.zero_grad()
        outputs = model(images)
        loss = criterion(outputs, labels)
        loss.backward()
        optimizer.step()
        total_loss += loss.item()

    print(f"Epoch {epoch+1}/{EPOCHS}, Loss: {total_loss/len(train_loader):.4f}")

# 6. Save model
torch.save(model.state_dict(), "efficientnet_b0_leaves.pth")

# 7. Save class labels
import json
with open("labels.json", "w") as f:
    json.dump({i: c for i, c in enumerate(train_dataset.classes)}, f)

print("✅ Model saved as efficientnet_b0_leaves.pth")
