import tensorflow as tf
from tensorflow import keras
from tensorflow.keras import layers
import numpy as np

def create_colorblind_simulation_model():
    model = keras.Sequential([
        layers.Input(shape=(None, None, 3)),
        
        layers.Conv2D(32, (3, 3), activation='relu', padding='same'),
        layers.BatchNormalization(),
        layers.Conv2D(32, (3, 3), activation='relu', padding='same'),
        layers.MaxPooling2D((2, 2)),
        
        layers.Conv2D(64, (3, 3), activation='relu', padding='same'),
        layers.BatchNormalization(),
        layers.Conv2D(64, (3, 3), activation='relu', padding='same'),
        layers.MaxPooling2D((2, 2)),
        
        layers.Conv2D(128, (3, 3), activation='relu', padding='same'),
        layers.BatchNormalization(),
        layers.Conv2D(128, (3, 3), activation='relu', padding='same'),
        
        layers.UpSampling2D((2, 2)),
        layers.Conv2D(64, (3, 3), activation='relu', padding='same'),
        layers.BatchNormalization(),
        
        layers.UpSampling2D((2, 2)),
        layers.Conv2D(32, (3, 3), activation='relu', padding='same'),
        layers.BatchNormalization(),
        
        layers.Conv2D(3, (3, 3), activation='sigmoid', padding='same')
    ])
    
    model.compile(
        optimizer=keras.optimizers.Adam(learning_rate=0.001),
        loss='mse',
        metrics=['mae']
    )
    
    return model

def create_colorblind_correction_model():
    model = keras.Sequential([
        layers.Input(shape=(None, None, 3)),
        
        layers.Conv2D(64, (3, 3), activation='relu', padding='same'),
        layers.BatchNormalization(),
        layers.Conv2D(64, (3, 3), activation='relu', padding='same'),
        layers.MaxPooling2D((2, 2)),
        
        layers.Conv2D(128, (3, 3), activation='relu', padding='same'),
        layers.BatchNormalization(),
        layers.Conv2D(128, (3, 3), activation='relu', padding='same'),
        layers.MaxPooling2D((2, 2)),
        
        layers.Conv2D(256, (3, 3), activation='relu', padding='same'),
        layers.BatchNormalization(),
        layers.Conv2D(256, (3, 3), activation='relu', padding='same'),
        
        layers.UpSampling2D((2, 2)),
        layers.Conv2D(128, (3, 3), activation='relu', padding='same'),
        layers.BatchNormalization(),
        
        layers.UpSampling2D((2, 2)),
        layers.Conv2D(64, (3, 3), activation='relu', padding='same'),
        layers.BatchNormalization(),
        
        layers.Conv2D(3, (3, 3), activation='sigmoid', padding='same')
    ])
    
    model.compile(
        optimizer=keras.optimizers.Adam(learning_rate=0.0001),
        loss='mse',
        metrics=['mae']
    )
    
    return model

def create_gan_model():
    def build_generator():
        model = keras.Sequential([
            layers.Input(shape=(256, 256, 3)),
            
            layers.Conv2D(64, (4, 4), strides=2, padding='same', use_bias=False),
            layers.LeakyReLU(0.2),
            
            layers.Conv2D(128, (4, 4), strides=2, padding='same', use_bias=False),
            layers.BatchNormalization(),
            layers.LeakyReLU(0.2),
            
            layers.Conv2D(256, (4, 4), strides=2, padding='same', use_bias=False),
            layers.BatchNormalization(),
            layers.LeakyReLU(0.2),
            
            layers.Conv2D(512, (4, 4), strides=2, padding='same', use_bias=False),
            layers.BatchNormalization(),
            layers.LeakyReLU(0.2),
            
            layers.Conv2DTranspose(256, (4, 4), strides=2, padding='same', use_bias=False),
            layers.BatchNormalization(),
            layers.ReLU(),
            
            layers.Conv2DTranspose(128, (4, 4), strides=2, padding='same', use_bias=False),
            layers.BatchNormalization(),
            layers.ReLU(),
            
            layers.Conv2DTranspose(64, (4, 4), strides=2, padding='same', use_bias=False),
            layers.BatchNormalization(),
            layers.ReLU(),
            
            layers.Conv2DTranspose(3, (4, 4), strides=2, padding='same', activation='tanh')
        ])
        return model
    
    def build_discriminator():
        model = keras.Sequential([
            layers.Input(shape=(256, 256, 3)),
            
            layers.Conv2D(64, (4, 4), strides=2, padding='same', use_bias=False),
            layers.LeakyReLU(0.2),
            
            layers.Conv2D(128, (4, 4), strides=2, padding='same', use_bias=False),
            layers.BatchNormalization(),
            layers.LeakyReLU(0.2),
            
            layers.Conv2D(256, (4, 4), strides=2, padding='same', use_bias=False),
            layers.BatchNormalization(),
            layers.LeakyReLU(0.2),
            
            layers.Conv2D(512, (4, 4), strides=2, padding='same', use_bias=False),
            layers.BatchNormalization(),
            layers.LeakyReLU(0.2),
            
            layers.Conv2D(1, (4, 4), padding='same', activation='sigmoid')
        ])
        return model
    
    generator = build_generator()
    discriminator = build_discriminator()
    
    discriminator.compile(
        optimizer=keras.optimizers.Adam(learning_rate=0.0002, beta_1=0.5),
        loss='binary_crossentropy',
        metrics=['accuracy']
    )
    
    discriminator.trainable = False
    gan_input = layers.Input(shape=(256, 256, 3))
    gan_output = discriminator(generator(gan_input))
    gan = keras.Model(gan_input, gan_output)
    gan.compile(
        optimizer=keras.optimizers.Adam(learning_rate=0.0002, beta_1=0.5),
        loss='binary_crossentropy'
    )
    
    return generator, discriminator, gan

def load_pretrained_model(model_path, model_type='simulation'):
    if model_type == 'simulation':
        model = create_colorblind_simulation_model()
    elif model_type == 'correction':
        model = create_colorblind_correction_model()
    else:
        raise ValueError(f"Unknown model type: {model_type}")
    
    model.load_weights(model_path)
    return model
