"use client";

import React, { ElementType, useId } from "react";
import clsx from "clsx";
import {
  Select as Select2,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils";
import Typography from "./Typography";
import { SearchIcon } from "lucide-react";
import Link from "next/link";

type InputVariant = "text" | "email" | "password" | "number" | "textarea" | "select";

interface SelectOption {
    value: string;
    label: React.ReactNode;
    disabled?: boolean;
    href?: string;
}

interface InputProps {
    variant?: InputVariant;
    label?: string;
    error?: string;
    options?: SelectOption[];
    name?: string;
    id?: string;
    value?: string;
    placeholder?: string;
    onChange?: (value: string) => void;
    disabled?: boolean;
    required?: boolean;
    wrapperClassName?: string;
    labelClassName?: string;
    className?: string;
    border?: boolean;
    prefix?: React.ReactNode;
    suffix?: React.ReactNode;
}

export default function Input({
    variant = "text",
    label,
    error,
    options = [],
    name,
    id,
    value,
    placeholder,
    onChange,
    disabled,
    required,
    wrapperClassName,
    labelClassName,
    border = true,
    className: inputClassName,
    prefix,
    suffix
}: InputProps) {
    const generatedId = useId();
    const inputId = id || generatedId;

    const tagMap: Record<InputVariant, ElementType> = {
        text: "input",
        email: "input",
        password: "input",
        number: "input",
        textarea: "textarea",
        select: "select",
    };

    const Component = tagMap[variant];

    
    const isSearch = inputId.startsWith("search");

    const baseClasses =
        "px-[14px] py-[10px] rounded-md outline-none transition ring-[1.2px] text-[16px] text-gray-700 font-normal placeholder:font-light placeholder:text-gray w-auto h-10 focus:border-gray-300";
    const errorClasses = error ? "ring-red-500 focus:ring-red-500" : "ring-gray-300 focus:ring-primary-500";
    const searchClasses = isSearch ? "ring-0 focus:ring-0 px-3 py-0 m-0 h-full w-full" : "";
    const prefixClasses = prefix ? "ring-0" : ""
    const wrapperPrefixClasses = prefix ? "flex flex-row items-center border ring-[1.2] ring-red-300 focus-within:border-primary-500 rounded-lg px-0.5" : "";
    const mergedClasses = cn(baseClasses, errorClasses, searchClasses, !border && "ring-0", prefixClasses, inputClassName);

    const inputElement = (
        <Component
            id={inputId}
            name={name}
            {...(variant !== "textarea" ? { type: variant } : {})}
            value={value}
            onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
            onChange?.(e.target.value)
            }
            placeholder={placeholder}
            disabled={disabled}
            required={required}
            className={`${mergedClasses}`}
            {...(variant === "textarea" ? { rows: 4 } : {})}
        />
    );
    
    return (
        <label htmlFor={inputId} className={cn(`flex flex-col gap-1 ${isSearch && (mergedClasses + "w-full focus-within:ring-primary-500 flex flex-row px-[14px] my3 py-0 items- ring-[1.2px] ring-gray-300 h-10")} ${!border && "ring-0"}`, wrapperClassName)}>
            {label && (
                <label
                    htmlFor={inputId}
                    className={clsx("", labelClassName)}
                >
                    <Typography weight={`medium`} color={`black`}>
                        {label} {required && <span>*</span>}
                    </Typography>
                </label>
            )}
            {
                isSearch && (
                    <SearchIcon className="text-gray-500 flex-shrink-0" size={20}/>
                )
            }
            {variant === "select" ? (
                <Select2 value={value} id={inputId} onValueChange={onChange}>
                    <SelectTrigger
                        id={inputId}
                        className={cn(
                            "border border-gray-300 p-2 rounded-md text-sm flex justify-between items-center w-full text-gray-600 font-medium ring-0 border-none",
                            !border && "border-0",
                            mergedClasses
                        )}
                        disabled={disabled}
                    >
                        <SelectValue placeholder={placeholder || "Select..."} className="text-gray-800 font-medium"/>
                    </SelectTrigger>
                    <SelectContent className="bg-white border rounded-md shadow-lg">
                        {options.map((opt) => (
                            <SelectItem
                                key={opt.value}
                                value={opt.value}
                                className="p-2 text-sm hover:bg-gray-100 text-gray-600 font-medium cursor-pointer"
                            >
                                {
                                    opt.href ? (
                                        <Link href={opt.href}>
                                            {opt.label}
                                        </Link>
                                    ) : (
                                        opt.label
                                    )
                                }
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select2>
            ) : 
            
            prefix ? (
                <div className={cn(`w-full flex items-center`, wrapperPrefixClasses)}>
                    <div className="w-full flex items-center">

                    <Typography size="base" className="px-2 py-2 h-full w-fit border-r">{prefix}</Typography>
                    {inputElement}
                    </div>
                    {   
                        suffix && (
                            <Typography size="base" className="px-2 py-2 h-full w-fit">{suffix}</Typography>
                        )
                    }   
                </div>
            ) : (
                inputElement
            )}

            {error && <Typography className={`text-red-500`}>{error}</Typography>}
        </label>
    );
}
