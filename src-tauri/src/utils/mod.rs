// src-tauri/src/utils/mod.rs
// 工具函数模块

pub mod sidecar;
use std::path::Path;
use std::fs;
use std::io;

// 文件工具
pub mod file_utils {
    use super::*;
    
    // 检查文件是否存在
    pub fn file_exists(path: &str) -> bool {
        Path::new(path).exists()
    }
    
    // 获取文件大小
    pub fn get_file_size(path: &str) -> io::Result<u64> {
        fs::metadata(path).map(|m| m.len())
    }
    
    // 获取文件扩展名
    pub fn get_file_extension(path: &str) -> Option<&str> {
        Path::new(path)
            .extension()
            .and_then(|ext| ext.to_str())
    }
    
    // 检查是否是视频文件
    pub fn is_video_file(path: &str) -> bool {
        let video_extensions = ["mp4", "mov", "avi", "mkv", "webm", "flv", "wmv", "m4v", "mpg", "mpeg"];
        
        get_file_extension(path)
            .map(|ext| {
                let ext_lower = ext.to_lowercase();
                video_extensions.contains(&ext_lower.as_str())
            })
            .unwrap_or(false)
    }
    
    // 创建目录（如果不存在）
    pub fn create_dir_if_not_exists(path: &str) -> io::Result<()> {
        if !Path::new(path).exists() {
            fs::create_dir_all(path)
        } else {
            Ok(())
        }
    }
    
    // 获取临时文件路径
    pub fn get_temp_file_path(extension: &str) -> String {
        let timestamp = chrono::Local::now().timestamp();
        let random: u32 = rand::random();
        format!("/tmp/silence_cutter_{}_{}.{}", timestamp, random, extension)
    }
}

// 数学工具
pub mod math_utils {
    // 线性到分贝转换
    pub fn linear_to_db(linear: f64) -> f64 {
        if linear <= 0.0 {
            -100.0
        } else {
            20.0 * linear.log10()
        }
    }
    
    // 分贝到线性转换
    pub fn db_to_linear(db: f64) -> f64 {
        10.0f64.powf(db / 20.0)
    }
    
    // 归一化
    pub fn normalize(value: f64, min: f64, max: f64) -> f64 {
        if max - min == 0.0 {
            0.0
        } else {
            (value - min) / (max - min)
        }
    }
    
    // 限制值在范围内
    pub fn clamp(value: f64, min: f64, max: f64) -> f64 {
        if value < min {
            min
        } else if value > max {
            max
        } else {
            value
        }
    }
    
    // 计算平均值
    pub fn mean(values: &[f64]) -> f64 {
        if values.is_empty() {
            return 0.0;
        }
        values.iter().sum::<f64>() / values.len() as f64
    }
    
    // 计算标准差
    pub fn std_dev(values: &[f64]) -> f64 {
        if values.len() < 2 {
            return 0.0;
        }
        
        let mean_val = mean(values);
        let variance = values.iter()
            .map(|&x| (x - mean_val).powi(2))
            .sum::<f64>() / (values.len() - 1) as f64;
        
        variance.sqrt()
    }
}

// 时间工具
pub mod time_utils {
    // 格式化时间（秒 -> HH:MM:SS.mmm）
    pub fn format_time(seconds: f64) -> String {
        let total_ms = (seconds * 1000.0) as u32;
        let hours = total_ms / 3_600_000;
        let minutes = (total_ms % 3_600_000) / 60_000;
        let secs = (total_ms % 60_000) / 1000;
        let ms = total_ms % 1000;
        
        if hours > 0 {
            format!("{:02}:{:02}:{:02}.{:03}", hours, minutes, secs, ms)
        } else {
            format!("{:02}:{:02}.{:03}", minutes, secs, ms)
        }
    }
    
    // 解析时间字符串
    pub fn parse_time(time_str: &str) -> Option<f64> {
        let parts: Vec<&str> = time_str.split(&[':', '.'][..]).collect();
        
        match parts.len() {
            3 => { // MM:SS.mmm
                let minutes: f64 = parts[0].parse().ok()?;
                let seconds: f64 = parts[1].parse().ok()?;
                let milliseconds: f64 = parts[2].parse().ok()?;
                Some(minutes * 60.0 + seconds + milliseconds / 1000.0)
            }
            4 => { // HH:MM:SS.mmm
                let hours: f64 = parts[0].parse().ok()?;
                let minutes: f64 = parts[1].parse().ok()?;
                let seconds: f64 = parts[2].parse().ok()?;
                let milliseconds: f64 = parts[3].parse().ok()?;
                Some(hours * 3600.0 + minutes * 60.0 + seconds + milliseconds / 1000.0)
            }
            _ => None,
        }
    }
}

// 日志工具
pub mod log_utils {
    use log::{Level, Metadata, Record};
    
    pub struct SimpleLogger;
    
    impl log::Log for SimpleLogger {
        fn enabled(&self, metadata: &Metadata) -> bool {
            metadata.level() <= Level::Info
        }
        
        fn log(&self, record: &Record) {
            if self.enabled(record.metadata()) {
                println!("[{}] {}: {}", record.level(), record.target(), record.args());
            }
        }
        
        fn flush(&self) {}
    }
    
    pub fn init_logger() -> Result<(), log::SetLoggerError> {
        log::set_boxed_logger(Box::new(SimpleLogger))
            .map(|()| log::set_max_level(log::LevelFilter::Info))
    }
}

// 错误处理工具
pub mod error_utils {
    use thiserror::Error;
    
    #[derive(Error, Debug)]
    pub enum AppError {
        #[error("IO错误: {0}")]
        Io(#[from] std::io::Error),
        
        #[error("FFmpeg错误: {0}")]
        Ffmpeg(String),
        
        #[error("音频处理错误: {0}")]
        Audio(String),
        
        #[error("视频处理错误: {0}")]
        Video(String),
        
        #[error("参数错误: {0}")]
        InvalidArgument(String),
        
        #[error("未知错误: {0}")]
        Unknown(String),
    }
    
    // 简化错误转换
    pub type AppResult<T> = Result<T, AppError>;
}